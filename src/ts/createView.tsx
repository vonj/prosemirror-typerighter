import { EditorView } from "prosemirror-view";
import { h, render } from "preact";
import MatchOverlay from "./components/MatchOverlay";
import Store from "./state/store";
import { Commands } from "./commands";
import { IMatch } from "./interfaces/IMatch";
import { MatcherService } from ".";
import { ILogger, consoleLogger } from "./utils/logger";
import Sidebar from "./components/Sidebar";

interface IViewOptions {
  view: EditorView;
  store: Store<IMatch>;
  matcherService: MatcherService<IMatch>;
  commands: Commands;
  sidebarNode: Element;
  contactHref?: string;
  feedbackHref?: string;
  logger?: ILogger;
  onIgnoreMatch?: (match: IMatch) => void;
}

/**
 * Instantiate a UI for the given EditorView, commands, and configuration,
 * appending it to the given HTML elements. This includes:
 *  - The overlay responsible for displaying tooltips
 *  - The plugin configuration pane
 *  - The plugin results pane
 */
const createView = ({
  view,
  store,
  matcherService,
  commands,
  sidebarNode,
  contactHref,
  feedbackHref,
  logger = consoleLogger,
  onIgnoreMatch
}: IViewOptions) => {
  // Create our overlay node, which is responsible for displaying
  // match messages when the user hovers over highlighted ranges.
  const overlayNode = document.createElement("div");

  // We wrap this in a container to allow the overlay to be positioned
  // relative to the editable document.
  const wrapperElement = document.createElement("div");
  wrapperElement.classList.add("TyperighterPlugin__container");
  view.dom.parentNode!.replaceChild(wrapperElement, view.dom);
  wrapperElement.appendChild(view.dom);
  view.dom.insertAdjacentElement("afterend", overlayNode);
  logger.info("Typerighter plugin starting");

  // Finally, render our components.
  render(
    <MatchOverlay
      store={store}
      applySuggestions={suggestionOpts => {
        commands.applySuggestions(suggestionOpts);
        commands.stopHover();
      }}
      onIgnoreMatch={
        onIgnoreMatch &&
        (match => {
          commands.ignoreMatch(match.matchId);
          onIgnoreMatch(match);
        })
      }
      containerElement={wrapperElement}
      feedbackHref={feedbackHref}
    />,
    overlayNode
  );

  render(
    <Sidebar 
      store={store}
      matcherService={matcherService}
      commands={commands}
      contactHref={contactHref}
      feedbackHref={feedbackHref}
    />,
    sidebarNode
  );
};

export default createView;
