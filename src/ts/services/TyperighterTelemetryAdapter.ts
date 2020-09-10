import {
  ITyperighterTelemetryEvent,
  ISuggestionAcceptedEvent,
  TYPERIGHTER_TELEMETRY_TYPE,
  IMarkAsCorrectEvent,
  ISidebarClickEvent,
  IMatchFoundEvent
} from "../interfaces/ITelemetryData";
import TelemetryService from './TelemetryService';

class TyperighterTelemetryAdapter {
  constructor(
    private telemetryService: TelemetryService,
    private app: string,
    private stage: string
  ) {}

  public suggestionIsAccepted(tags: ISuggestionAcceptedEvent["tags"]) {
    this.telemetryService.addEvent({
      app: this.app,
      stage: this.stage,
      type: TYPERIGHTER_TELEMETRY_TYPE.TYPERIGHTER_SUGGESTION_IS_ACCEPTED,
      value: 1,
      eventTime: new Date().toISOString(),
      tags
    });
  }

  public matchIsMarkedAsCorrect(tags: IMarkAsCorrectEvent["tags"]) {
    this.telemetryService.addEvent({
      app: this.app,
      stage: this.stage,
      type: TYPERIGHTER_TELEMETRY_TYPE.TYPERIGHTER_MARK_AS_CORRECT,
      value: 1,
      eventTime: new Date().toISOString(),
      tags
    });
  }

  public documentIsChecked(tags: ITyperighterTelemetryEvent["tags"]) {
    this.telemetryService.addEvent({
      app: this.app,
      stage: this.stage,
      type: TYPERIGHTER_TELEMETRY_TYPE.TYPERIGHTER_CHECK_DOCUMENT,
      value: 1,
      eventTime: new Date().toISOString(),
      tags
    });
  }

  public typerighterIsOpened(tags: ITyperighterTelemetryEvent["tags"]) {
    this.telemetryService.addEvent({
        app: this.app,
        stage: this.stage,
        type: TYPERIGHTER_TELEMETRY_TYPE.TYPERIGHTER_OPEN_STATE_CHANGED,
        value: 1,
        eventTime: new Date().toISOString(),
        tags
    });
  }

  public typerighterIsClosed(tags: ITyperighterTelemetryEvent["tags"]) {
    this.telemetryService.addEvent({
        app: this.app,
        stage: this.stage,
        type: TYPERIGHTER_TELEMETRY_TYPE.TYPERIGHTER_OPEN_STATE_CHANGED,
        value: 0,
        eventTime: new Date().toISOString(),
        tags
    });
  }

  public sidebarMatchClicked(tags: ISidebarClickEvent["tags"]) {
    this.telemetryService.addEvent({
        app: this.app,
        stage: this.stage,
        type: TYPERIGHTER_TELEMETRY_TYPE.TYPERIGHTER_SIDEBAR_MATCH_CLICK,
        value: 1,
        eventTime: new Date().toISOString(),
        tags
    });
  }

  public matchFound(tags: IMatchFoundEvent["tags"]) {
    this.telemetryService.addEvent({
        app: this.app,
        stage: this.stage,
        type: TYPERIGHTER_TELEMETRY_TYPE.TYPERIGHTER_MATCH_FOUND,
        value: 1,
        eventTime: new Date().toISOString(),
        tags
    });
  }
}

export default TyperighterTelemetryAdapter;
