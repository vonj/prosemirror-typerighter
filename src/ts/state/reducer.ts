import { Transaction } from "prosemirror-state";
import {
  ActionSetRequestMatchesOnDocModified,
  ActionSetDebugState,
  ActionRequestError,
  ActionRequestMatchesSuccess,
  ActionRequestMatchesForDocument,
  ActionRequestMatchesForDirtyRanges,
  ActionHandleNewDirtyRanges,
  ActionNewHoverIdReceived,
  ActionSelectMatch,
  NEW_HOVER_ID,
  REQUEST_FOR_DIRTY_RANGES,
  REQUEST_FOR_DOCUMENT,
  REQUEST_SUCCESS,
  REQUEST_ERROR,
  REQUEST_COMPLETE,
  SELECT_MATCH,
  APPLY_NEW_DIRTY_RANGES,
  SET_DEBUG_STATE,
  SET_REQUEST_MATCHES_ON_DOC_MODIFIED,
  Action,
  ActionRequestComplete
} from "./actions";
import { IMatch, IBlock, IRange } from "../interfaces/IMatch";
import { DecorationSet, Decoration } from "prosemirror-view";
import omit from "lodash/omit";
import {
  createDebugDecorationFromRange,
  DECORATION_DIRTY,
  DECORATION_INFLIGHT,
  removeDecorationsFromRanges,
  DECORATION_MATCH,
  createDecorationsForMatch,
  createDecorationsForMatches
} from "../utils/decoration";
import {
  mergeRanges,
  blockToRange,
  mapAndMergeRanges,
  mapRanges,
  findOverlappingRangeIndex,
  removeOverlappingRanges
} from "../utils/range";
import { ExpandRanges } from "../createTyperighterPlugin";
import { getBlocksFromDocument } from "../utils/prosemirror";
import { Node } from "prosemirror-model";
import {
  selectSingleBlockInFlightById,
  selectBlockQueriesInFlightForSet,
  selectMatchByMatchId,
  selectBlockQueriesInFlightById
} from "./selectors";
import { Mapping } from "prosemirror-transform";
import { createBlock } from "../utils/block";

/**
 * Information about the span element the user is hovering over.
 */
export interface IStateHoverInfo {
  // The offsetLeft property of the element relative to the document container.
  // If the span covers multiple lines, this will be the point that the span
  // starts on the line - for the left position of the bounding rectangle see
  // `left`.
  offsetLeft: number;
  // The offsetTop property of the element relative to the document container.
  offsetTop: number;
  // The left property from the element's bounding rectangle.
  containerLeft: number;
  // The top property from the element's bounding rectangle.
  containerTop: number;
  // The height of the element.
  height: number;
  // The x coordinate of the mouse position relative to the element
  mouseClientX: number;
  // The y coordinate of the mouse position relative to the element
  mouseClientY: number;
  // The height the element would have if it occupied a single line.
  // Useful when determining where to put a tooltip if the user
  // is hovering over a span that covers several lines.
  markerClientRects: DOMRectList | ClientRectList;
}

export interface IBlockInFlight {
  // The categories that haven't yet reported for this block.
  pendingCategoryIds: string[];
  block: IBlock;
}

export interface IBlocksInFlightState {
  totalBlocks: number;
  // The category ids that were sent with the request.
  categoryIds: string[];
  pendingBlocks: IBlockInFlight[];
  mapping: Mapping;
}

export interface IPluginState<TMatches extends IMatch = IMatch> {
  // Is the plugin in debug mode? Debug mode adds marks to show dirtied
  // and expanded ranges.
  debug: boolean;
  // Should we trigger a request when the document is modified?
  requestMatchesOnDocModified: boolean;
  // The current decorations the plugin is applying to the document.
  decorations: DecorationSet;
  // The current matches for the document.
  currentMatches: TMatches[];
  // The current ranges that are marked as dirty, that is, have been
  // changed since the last request.
  dirtiedRanges: IRange[];
  // The currently selected match.
  selectedMatch: string | undefined;
  // The id of the match the user is currently hovering over.
  hoverId: string | undefined;
  // See StateHoverInfo.
  hoverInfo: IStateHoverInfo | undefined;
  // Are there requests pending: have ranges been dirtied but
  // not yet been expanded and sent in a request?
  requestPending: boolean;
  // The sets of blocks that have been sent to the matcher service
  // and have not yet completed processing.
  requestsInFlight: {
    [requestId: string]: IBlocksInFlightState;
  };
  // The current error message.
  errorMessage: string | undefined;
}

// The transaction meta key that namespaces our actions.
export const PROSEMIRROR_TYPERIGHTER_ACTION = "PROSEMIRROR_TYPERIGHTER_ACTION";

/**
 * Initial state.
 */
export const createInitialState = <TMatch extends IMatch>(
  doc: Node,
  matches: TMatch[] = []
): IPluginState<TMatch> => ({
  debug: false,
  requestMatchesOnDocModified: false,
  decorations: DecorationSet.create(doc, []),
  dirtiedRanges: [],
  currentMatches: matches,
  selectedMatch: undefined,
  hoverId: undefined,
  hoverInfo: undefined,
  requestsInFlight: {},
  requestPending: false,
  errorMessage: undefined
});

export const createReducer = (expandRanges: ExpandRanges) => {
  const handleMatchesRequestForDirtyRanges = createHandleMatchesRequestForDirtyRanges(
    expandRanges
  );
  return <TMatch extends IMatch>(
    tr: Transaction,
    incomingState: IPluginState<TMatch>,
    action?: Action<TMatch>
  ): IPluginState<TMatch> => {
    // There are certain things we need to do every time the document is changed, e.g. mapping ranges.
    const state = tr.docChanged
      ? getNewStateFromTransaction(tr, incomingState)
      : incomingState;

    if (!action) {
      return state;
    }

    switch (action.type) {
      case NEW_HOVER_ID:
        return handleNewHoverId(tr, state, action);
      case REQUEST_FOR_DIRTY_RANGES:
        return handleMatchesRequestForDirtyRanges(tr, state, action);
      case REQUEST_FOR_DOCUMENT:
        return handleMatchesRequestForDocument(tr, state, action);
      case REQUEST_SUCCESS:
        return handleMatchesRequestSuccess(tr, state, action);
      case REQUEST_ERROR:
        return handleMatchesRequestError(tr, state, action);
      case REQUEST_COMPLETE:
        return handleRequestComplete(tr, state, action);
      case SELECT_MATCH:
        return handleSelectMatch(tr, state, action);
      case APPLY_NEW_DIRTY_RANGES:
        return handleNewDirtyRanges(tr, state, action);
      case SET_DEBUG_STATE:
        return handleSetDebugState(tr, state, action);
      case SET_REQUEST_MATCHES_ON_DOC_MODIFIED:
        return handleSetRequestOnDocModifiedState(tr, state, action);
      default:
        return state;
    }
  };
};

/**
 * Get a new plugin state from the incoming transaction.
 *
 * We need to respond to each transaction in our reducer, whether or not there's
 * an action present, in order to maintain mappings and respond to user input.
 */
const getNewStateFromTransaction = <TMatch extends IMatch>(
  tr: Transaction,
  incomingState: IPluginState<TMatch>
): IPluginState<TMatch> => {
  const mappedRequestsInFlight = Object.entries(
    incomingState.requestsInFlight
  ).reduce((acc, [requestId, requestsInFlight]) => {
    // We create a new mapping here to preserve state immutability, as
    // appendMapping mutates an existing mapping.
    const mapping = new Mapping();
    mapping.appendMapping(requestsInFlight.mapping);
    mapping.appendMapping(tr.mapping);
    return {
      ...acc,
      [requestId]: {
        ...requestsInFlight,
        mapping
      }
    };
  }, {});
  return {
    ...incomingState,
    decorations: incomingState.decorations.map(tr.mapping, tr.doc),
    dirtiedRanges: mapAndMergeRanges(incomingState.dirtiedRanges, tr.mapping),
    currentMatches: mapRanges(incomingState.currentMatches, tr.mapping),
    requestsInFlight: mappedRequestsInFlight
  };
};

/**
 * Action handlers.
 */

/**
 * Handle the selection of a hover id.
 */
const handleSelectMatch = <TMatch extends IMatch>(
  _: unknown,
  state: IPluginState<TMatch>,
  action: ActionSelectMatch
): IPluginState<TMatch> => {
  return {
    ...state,
    selectedMatch: action.payload.matchId
  };
};

/**
 * Handle the receipt of a new hover id.
 */
const handleNewHoverId = <TMatch extends IMatch>(
  tr: Transaction,
  state: IPluginState<TMatch>,
  action: ActionNewHoverIdReceived
): IPluginState<TMatch> => {
  let decorations = state.decorations;
  const incomingHoverId = action.payload.matchId;
  const currentHoverId = state.hoverId;

  // The current hover decorations are no longer valid -- remove them.
  const currentHoverDecorations = decorations.find(
    undefined,
    undefined,
    spec =>
      (spec.id === currentHoverId || spec.id === incomingHoverId) &&
      spec.type === DECORATION_MATCH
  );

  decorations = decorations.remove(currentHoverDecorations);

  // Add the new decorations for the current and incoming matches.
  const decorationData = [{ id: incomingHoverId, isSelected: true }];
  if (incomingHoverId !== currentHoverId) {
    decorationData.push({ id: currentHoverId, isSelected: false });
  }
  decorations = decorationData.reduce((acc, hoverData) => {
    const output = selectMatchByMatchId(state, hoverData.id || "");
    if (!output) {
      return acc;
    }
    return decorations.add(
      tr.doc,
      createDecorationsForMatch(output, hoverData.isSelected, false)
    );
  }, decorations);

  return {
    ...state,
    decorations,
    hoverId: action.payload.matchId,
    hoverInfo: action.payload.hoverInfo
  };
};

const handleNewDirtyRanges = <TMatch extends IMatch>(
  tr: Transaction,
  state: IPluginState<TMatch>,
  { payload: { ranges: dirtiedRanges } }: ActionHandleNewDirtyRanges
) => {
  // Map our dirtied ranges through the current transaction, and append any new ranges it has dirtied.
  let newDecorations = state.debug
    ? state.decorations.add(
        tr.doc,
        dirtiedRanges.map(range => createDebugDecorationFromRange(range))
      )
    : state.decorations;

  // Remove any matches and associated decorations
  // touched by the dirtied ranges from the doc
  newDecorations = removeDecorationsFromRanges(newDecorations, dirtiedRanges);
  const currentMatches = state.currentMatches.filter(
    output => findOverlappingRangeIndex(output, dirtiedRanges) === -1
  );

  return {
    ...state,
    currentMatches,
    decorations: newDecorations,
    // We only care about storing dirtied ranges if we're validating
    // in response to user edits.
    requestPending: state.requestMatchesOnDocModified ? true : false,
    dirtiedRanges: state.requestMatchesOnDocModified
      ? state.dirtiedRanges.concat(dirtiedRanges)
      : []
  };
};

/**
 * Handle a matches request for the current set of dirty ranges.
 */
const createHandleMatchesRequestForDirtyRanges = (
  expandRanges: ExpandRanges
) => <TMatch extends IMatch>(
  tr: Transaction,
  state: IPluginState<TMatch>,
  { payload: { requestId, categoryIds } }: ActionRequestMatchesForDirtyRanges
) => {
  const ranges = expandRanges(state.dirtiedRanges, tr.doc);
  const blocks: IBlock[] = ranges.map(range =>
    createBlock(tr.doc, range, tr.time)
  );
  return handleRequestStart(requestId, blocks, categoryIds)(tr, state);
};

/**
 * Handle a matches request for the entire document.
 */
const handleMatchesRequestForDocument = <TMatch extends IMatch>(
  tr: Transaction,
  state: IPluginState<TMatch>,
  { payload: { requestId, categoryIds } }: ActionRequestMatchesForDocument
) => {
  return handleRequestStart(
    requestId,
    getBlocksFromDocument(tr.doc, tr.time),
    categoryIds
  )(tr, state);
};

/**
 * Handle a matches request for a given set of blocks.
 */
const handleRequestStart = (
  requestId: string,
  blocks: IBlock[],
  categoryIds: string[]
) => <TMatch extends IMatch>(
  tr: Transaction,
  state: IPluginState<TMatch>
): IPluginState<TMatch> => {
  // Replace any debug decorations, if they exist.
  const decorations = state.debug
    ? removeDecorationsFromRanges(state.decorations, blocks, [
        DECORATION_DIRTY
      ]).add(
        tr.doc,
        blocks.map(range => createDebugDecorationFromRange(range, false))
      )
    : state.decorations;

  const newBlockQueriesInFlight: IBlockInFlight[] = blocks.map(block => ({
    block,
    pendingCategoryIds: categoryIds
  }));

  return {
    ...state,
    errorMessage: undefined,
    decorations,
    // We reset the dirty ranges, as they've been expanded and sent in a request.
    dirtiedRanges: [],
    requestPending: false,
    requestsInFlight: {
      ...state.requestsInFlight,
      [requestId]: {
        totalBlocks: newBlockQueriesInFlight.length,
        pendingBlocks: newBlockQueriesInFlight,
        mapping: tr.mapping,
        categoryIds
      }
    }
  };
};

const amendBlockQueriesInFlight = <TMatch extends IMatch>(
  state: IPluginState<TMatch>,
  requestId: string,
  blockId: string,
  categoryIds: string[]
) => {
  const currentBlockQueriesInFlight = selectBlockQueriesInFlightForSet(
    state,
    requestId
  );
  if (!currentBlockQueriesInFlight) {
    return state.requestsInFlight;
  }
  const newBlockQueriesInFlight: IBlocksInFlightState = {
    ...currentBlockQueriesInFlight,
    pendingBlocks: currentBlockQueriesInFlight.pendingBlocks.reduce(
      (acc, blockInFlight) => {
        // Don't modify blocks that don't match
        if (blockInFlight.block.id !== blockId) {
          return acc.concat(blockInFlight);
        }
        const newBlockInFlight = {
          ...blockInFlight,
          pendingCategoryIds: blockInFlight.pendingCategoryIds.filter(
            id => !categoryIds.includes(id)
          )
        };
        return newBlockInFlight.pendingCategoryIds.length
          ? acc.concat(newBlockInFlight)
          : acc;
      },
      [] as IBlockInFlight[]
    )
  };
  if (!newBlockQueriesInFlight.pendingBlocks.length) {
    return omit(state.requestsInFlight, requestId);
  }
  return {
    ...state.requestsInFlight,
    [requestId]: newBlockQueriesInFlight
  };
};

/**
 * Handle a response, decorating the document with any matches we've received.
 */
const handleMatchesRequestSuccess = <TMatch extends IMatch>(
  tr: Transaction,
  state: IPluginState<TMatch>,
  { payload: { response } }: ActionRequestMatchesSuccess<TMatch>
): IPluginState<TMatch> => {
  if (!response) {
    return state;
  }

  const requestsInFlight = selectBlockQueriesInFlightById(
    state,
    response.requestId,
    response.blocks.map(_ => _.id)
  );

  if (!requestsInFlight.length) {
    return state;
  }

  // Remove matches superceded by the incoming matches.
  let currentMatches: TMatch[] = removeOverlappingRanges(
    state.currentMatches,
    requestsInFlight.map(_ => _.block),
    match => !response.categoryIds.includes(match.category.id)
  );
  // Remove decorations superceded by the incoming matches.
  const decsToRemove = requestsInFlight.reduce(
    (acc, blockInFlight) =>
      acc.concat(
        state.decorations
          .find(blockInFlight.block.from, blockInFlight.block.to, spec =>
            response.categoryIds.includes(spec.categoryId)
          )
          .concat(
            state.debug
              ? // Ditch any decorations marking inflight matches.
                state.decorations.find(
                  undefined,
                  undefined,
                  _ => _.type === DECORATION_INFLIGHT
                )
              : []
          )
      ),
    [] as Decoration[]
  );

  // Add the response to the current matches.
  currentMatches = currentMatches.concat(
    mapRanges(
      response.matches,
      selectBlockQueriesInFlightForSet(state, response.requestId)!.mapping
    )
  );

  // We don't apply incoming matches to ranges that have
  // been dirtied since they were requested.
  currentMatches = removeOverlappingRanges(currentMatches, state.dirtiedRanges);

  // Create our decorations for the newly current matches.
  const newDecorations = createDecorationsForMatches(response.matches);

  // Amend the block queries in flight to
  const newBlockQueriesInFlight = requestsInFlight.reduce(
    (acc, blockInFlight) =>
      amendBlockQueriesInFlight(
        { ...state, requestsInFlight: acc },
        response.requestId,
        blockInFlight.block.id,
        response.categoryIds
      ),
    state.requestsInFlight
  );

  return {
    ...state,
    requestsInFlight: newBlockQueriesInFlight,
    currentMatches,
    decorations: state.decorations
      .remove(decsToRemove)
      .add(tr.doc, newDecorations)
  };
};

/**
 * Handle a matches request error.
 */
const handleMatchesRequestError = <TMatch extends IMatch>(
  tr: Transaction,
  state: IPluginState<TMatch>,
  {
    payload: {
      matchRequestError: { requestId, blockId, message, categoryIds }
    }
  }: ActionRequestError
) => {
  if (!blockId) {
    return { ...state, message };
  }

  const requestsInFlight = selectBlockQueriesInFlightForSet(state, requestId);

  if (!requestsInFlight) {
    return state;
  }

  const blockInFlight = selectSingleBlockInFlightById(
    state,
    requestId,
    blockId
  );

  if (!blockInFlight) {
    return { ...state, message };
  }

  const dirtiedRanges = blockInFlight
    ? mapRanges([blockToRange(blockInFlight.block)], requestsInFlight.mapping)
    : [];

  const decsToRemove = dirtiedRanges.reduce(
    (acc, range) =>
      acc.concat(
        state.decorations.find(
          range.from,
          range.to,
          _ => _.type === DECORATION_INFLIGHT
        )
      ),
    [] as Decoration[]
  );

  // When we get errors, we map the ranges due to be checked back
  // through the document and add them to the dirtied ranges to be
  // checked on the next pass.
  let decorations = state.decorations.remove(decsToRemove);

  if (dirtiedRanges.length && state.debug) {
    decorations = decorations.add(
      tr.doc,
      dirtiedRanges.map(range => createDebugDecorationFromRange(range))
    );
  }

  return {
    ...state,
    dirtiedRanges: dirtiedRanges.length
      ? mergeRanges(state.dirtiedRanges.concat(dirtiedRanges))
      : state.dirtiedRanges,
    decorations,
    requestsInFlight: amendBlockQueriesInFlight(state, requestId, blockId, categoryIds),
    errorMessage: message
  };
};

const handleRequestComplete = <TMatch extends IMatch>(
  _: Transaction,
  state: IPluginState<TMatch>,
  { payload: { requestId } }: ActionRequestComplete
) => {
  const requestInFlight = selectBlockQueriesInFlightForSet(state, requestId);
  const hasUnfinishedWork =
    requestInFlight &&
    requestInFlight.pendingBlocks.some(
      block => block.pendingCategoryIds.length
    );
  if (requestInFlight && hasUnfinishedWork) {
    /* tslint:disable-next-line:no-console */
    console.warn(
      `Request ${requestId} was marked as complete, but there is still work remaining.`,
      requestInFlight.pendingBlocks
    );
  }
  return {
    ...state,
    requestsInFlight: omit(state.requestsInFlight, requestId)
  };
};

const handleSetDebugState = <TMatch extends IMatch>(
  _: Transaction,
  state: IPluginState<TMatch>,
  { payload: { debug } }: ActionSetDebugState
) => {
  return {
    ...state,
    debug
  };
};

const handleSetRequestOnDocModifiedState = <TMatch extends IMatch>(
  _: Transaction,
  state: IPluginState<TMatch>,
  {
    payload: { requestMatchesOnDocModified }
  }: ActionSetRequestMatchesOnDocModified
) => {
  return {
    ...state,
    requestMatchesOnDocModified
  };
};
