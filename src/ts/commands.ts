import { Transaction, EditorState } from "prosemirror-state";
import {
  newHoverIdReceived,
  requestMatchesForDocument,
  selectMatch,
  setConfigValue,
  requestMatchesSuccess,
  requestError,
  requestMatchesForDirtyRanges,
  requestMatchesComplete,
  removeMatch,
  removeAllMatches,
  newHighlightIdReceived,
  setFilterState
} from "./state/actions";
import {
  selectMatchByMatchId,
  selectAllAutoFixableMatches
} from "./state/selectors";
import {
  PROSEMIRROR_TYPERIGHTER_ACTION,
  IPluginState,
  IPluginConfig
} from "./state/reducer";
import {
  IMatcherResponse,
  TMatchRequestErrorWithDefault
} from "./interfaces/IMatch";
import { EditorView } from "prosemirror-view";
import { compact } from "./utils/array";
import {
  getPatchesFromReplacementText,
  applyPatchToTransaction
} from "./utils/prosemirror";

type Command = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean;

type GetState<TPluginState extends IPluginState = IPluginState> = (
  state: EditorState
) => TPluginState;

/**
 * Requests matches for an entire document.
 */
export const requestMatchesForDocumentCommand = (
  requestId: string,
  categoryIds: string[]
): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        requestMatchesForDocument(requestId, categoryIds)
      )
    );
  }
  return true;
};

/**
 * Request matches for the current set of dirty ranges.
 */
export const requestMatchesForDirtyRangesCommand = (
  requestId: string,
  categoryIds: string[]
): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        requestMatchesForDirtyRanges(requestId, categoryIds)
      )
    );
  }

  return true;
};

/**
 * Indicate the user is hovering over a match.
 */
export const startHoverCommand = (matchId: string, rectIndex: number | undefined): Command => (
  state,
  dispatch
) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        newHoverIdReceived(matchId, rectIndex)
      )
    );
  }
  return true;
};

/**
 * Indicate that the user is no longer hovering over a match.
 */
export const stopHoverCommand = (): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        newHoverIdReceived(undefined, undefined)
      )
    );
  }
  return true;
};

/**
 * Indicate the user is highlighting a match decoration.
 *
 * The highlight state indicates that we'd like to draw the user's
 * attention to this match, without additional UI elements, e.g. tooltips.
 */
export const startHighlightCommand = (matchId: string): Command => (
  state,
  dispatch
) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        newHighlightIdReceived(matchId)
      )
    );
  }
  return true;
};

/**
 * Indicate that the user is no longer highlighting a match decoration.
 */
export const stopHighlightCommand = (): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        newHighlightIdReceived(undefined)
      )
    );
  }
  return true;
};

/**
 * Mark a given match as active.
 */
export const selectMatchCommand = <TPluginState extends IPluginState>(
  matchId: string,
  getState: GetState<TPluginState>
): Command => (state, dispatch) => {
  const pluginState = getState(state);
  const output = selectMatchByMatchId(pluginState, matchId);
  if (!output) {
    return false;
  }
  if (dispatch) {
    dispatch(
      state.tr.setMeta(PROSEMIRROR_TYPERIGHTER_ACTION, selectMatch(matchId))
    );
  }
  return true;
};

/**
 * Set a configuration value.
 */
export const setConfigValueCommand = <
  ConfigKey extends keyof IPluginConfig,
  ConfigValue extends IPluginConfig[ConfigKey]
>(
  key: ConfigKey,
  value: ConfigValue
): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        setConfigValue(key, value)
      )
    );
  }
  return true;
};

/**
 * Set the current filter state.
 */
export const setFilterStateCommand = <TPluginState extends IPluginState>(
  filterState: TPluginState["filterState"]
): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        setFilterState(filterState)
      )
    );
  }
  return true;
};

/**
 * Apply a successful matcher response to the document.
 */
export const applyMatcherResponseCommand = (
  matcherResponse: IMatcherResponse
): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        requestMatchesSuccess(matcherResponse)
      )
    );
  }
  return true;
};

/**
 * Apply an error to the document. Important to ensure
 * that failed matcher requests are reapplied as dirtied ranges
 * to be resent on the next request.
 */
export const applyRequestErrorCommand = (
  matchRequestError: TMatchRequestErrorWithDefault
): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        requestError({
          ...matchRequestError,
          type: matchRequestError.type || "GENERAL_ERROR"
        })
      )
    );
  }
  return true;
};

/**
 * Mark the
 */
export const applyRequestCompleteCommand = (requestId: string): Command => (
  state,
  dispatch
) => {
  if (dispatch) {
    dispatch(
      state.tr.setMeta(
        PROSEMIRROR_TYPERIGHTER_ACTION,
        requestMatchesComplete(requestId)
      )
    );
  }
  return true;
};

export type ApplySuggestionOptions = Array<{
  matchId: string;
  text: string;
}>;

/**
 * Applies a suggestion from a match to the document.
 */
export const applySuggestionsCommand = (
  suggestionOptions: ApplySuggestionOptions,
  getState: GetState
): Command => (state, dispatch) => {
  const pluginState = getState(state);
  const suggestionsToApply = suggestionOptions
    .map(opt => {
      const maybeMatch = selectMatchByMatchId(pluginState, opt.matchId);
      return maybeMatch
        ? {
            from: maybeMatch.from,
            to: maybeMatch.to,
            text: opt.text
          }
        : undefined;
    })
    .filter(compact);

  return maybeApplySuggestions(suggestionsToApply, state, dispatch);
};

/**
 * Applies the first suggestion for each rule marked as auto-fixable.
 */
export const applyAutoFixableSuggestionsCommand = (
  getState: GetState
): Command => (state, dispatch) => {
  const pluginState = getState(state);
  const suggestionsToApply = selectAllAutoFixableMatches(pluginState).map(
    output => ({
      from: output.from,
      to: output.to,
      text:
        output.suggestions && output.suggestions.length
          ? output.suggestions[0].text
          : undefined
    })
  );
  return maybeApplySuggestions(suggestionsToApply, state, dispatch);
};

/**
 * Ignore a match, removing it from the plugin state.
 * Returns true if the match was found, false if not.
 */
export const ignoreMatchCommand = (id: string) => (getState: GetState) => (
  state: EditorState,
  dispatch?: (tr: Transaction<any>) => void
): boolean => {
  const match = selectMatchByMatchId(getState(state), id);
  if (match && dispatch) {
    dispatch(state.tr.setMeta(PROSEMIRROR_TYPERIGHTER_ACTION, removeMatch(id)));
  }
  return !!match;
};

export const clearMatchesCommand = () => <TPluginState extends IPluginState>(
  _: GetState<TPluginState>
) => (
  state: EditorState,
  dispatch?: (tr: Transaction<any>) => void
): boolean => {
  if (dispatch) {
    dispatch(state.tr.setMeta(PROSEMIRROR_TYPERIGHTER_ACTION, removeAllMatches()));
  }
  return true;
};

const maybeApplySuggestions = (
  suggestionsToApply: Array<{
    from: number;
    to: number;
    text: string | undefined;
  }>,
  state: EditorState,
  dispatch?: (tr: Transaction<any>) => void
) => {
  if (!suggestionsToApply.length) {
    return false;
  }

  if (!dispatch) {
    return true;
  }

  const tr = state.tr;
  suggestionsToApply.forEach(({ from, to, text }) => {
    if (!text) {
      return;
    }

    const mappedFrom = tr.mapping.map(from);
    const mappedTo = tr.mapping.map(to);
    const replacementFrags = getPatchesFromReplacementText(
      tr,
      mappedFrom,
      mappedTo,
      text
    );

    replacementFrags.forEach(frag =>
      applyPatchToTransaction(tr, state.schema, frag)
    );
  });

  dispatch(tr);

  return true;
};

/**
 * Create a palette of prosemirror-typerighter commands bound to the given EditorView.
 */
export const createBoundCommands = <TPluginState extends IPluginState>(
  view: EditorView,
  getState: GetState<TPluginState>
) => {
  const bindCommand = <CommandArgs extends any[]>(
    action: (...args: CommandArgs) => Command
  ) => (...args: CommandArgs) => action(...args)(view.state, view.dispatch);
  return {
    ignoreMatch: (id: string) =>
      ignoreMatchCommand(id)(getState)(view.state, view.dispatch),
    clearMatches: () => clearMatchesCommand()(getState)(view.state, view.dispatch),
    applySuggestions: (suggestionOpts: ApplySuggestionOptions) =>
      applySuggestionsCommand(suggestionOpts, getState)(
        view.state,
        view.dispatch
      ),
    selectMatch: (blockId: string) =>
      selectMatchCommand(blockId, getState)(view.state, view.dispatch),
    applyAutoFixableSuggestions: () =>
      applyAutoFixableSuggestionsCommand(getState)(view.state, view.dispatch),
    requestMatchesForDocument: bindCommand(requestMatchesForDocumentCommand),
    requestMatchesForDirtyRanges: bindCommand(
      requestMatchesForDirtyRangesCommand
    ),
    indicateHover: bindCommand(startHoverCommand),
    stopHover: bindCommand(stopHoverCommand),
    indicateHighlight: bindCommand(startHighlightCommand),
    stopHighlight: bindCommand(stopHighlightCommand),
    setConfigValue: bindCommand(setConfigValueCommand),
    applyMatcherResponse: bindCommand(applyMatcherResponseCommand),
    applyRequestError: bindCommand(applyRequestErrorCommand),
    applyRequestComplete: bindCommand(applyRequestCompleteCommand),
    setFilterState: bindCommand(setFilterStateCommand)
  };
};

export type Commands = ReturnType<typeof createBoundCommands>;
