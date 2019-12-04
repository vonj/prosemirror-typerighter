import { Component, h } from "preact";
import v4 from "uuid/v4";
import Store, { STORE_EVENT_NEW_STATE } from "../state/store";
import { IPluginState } from "../state/reducer";
import { IMatch, ICategory } from "../interfaces/IMatch";

interface IProps {
  store: Store<IMatch>;
  setDebugState: (debug: boolean) => void;
  setRequestOnDocModified: (r: boolean) => void;
  requestMatchesForDocument: (requestId: string, categoryIds: string[]) => void;
  fetchCategories: () => Promise<ICategory[]>;
  getCurrentCategories: () => ICategory[];
  addCategory: (id: string) => void;
  removeCategory: (id: string) => void;
}

interface IState {
  pluginState?: IPluginState<IMatch>;
  isOpen: boolean;
  allCategories: ICategory[];
  currentCategories: ICategory[];
  isLoadingCategories: boolean;
}

/**
 * A sidebar to display current matches and allow users to apply suggestions.
 */
class Controls extends Component<IProps, IState> {
  public state = {
    isOpen: false,
    allCategories: [],
    currentCategories: [],
    isLoadingCategories: false
  } as IState;
  public componentWillMount() {
    this.props.store.on(STORE_EVENT_NEW_STATE, this.handleNotify);
    this.initCategories();
  }

  public render() {
    // const { setDebugState, setRequestOnDocModified } = this.props;
    // const { debug = false, requestMatchesOnDocModified = false } =
    //   this.state.pluginState || {};
    const { isOpen, isLoadingCategories } = this.state;
    return (
      <div className="Sidebar__section">
        <div className="Sidebar__header-container">
          <div
            className="Sidebar__header Sidebar__header-toggle"
            onClick={this.toggleOpenState}
          >
            Controls
            <div className="Sidebar__toggle-label">Advanced</div>
            <div
              className="Sidebar__toggle"
              style={{ transform: isOpen ? "" : "rotate(-90deg)" }}
            >
              ▼
            </div>
          </div>
        </div>
        <div className="Sidebar__content">
          {isOpen && (
            <div>
              {/* <div className="Controls__row">
                <label
                  className="Controls__label"
                  for="Controls__check-on-modify"
                >
                  Run checks when the document is modified
                </label>
                <div class="Controls__input">
                  <input
                    type="checkbox"
                    id="Controls__check-on-modify"
                    checked={requestMatchesOnDocModified}
                    className="Input"
                    onClick={() =>
                      setRequestOnDocModified(
                        !requestMatchesOnDocModified
                      )
                    }
                  />
                </div>
              </div>
              <div className="Controls__row">
                <label
                  className="Controls__label"
                  for="Controls__show-dirty-ranges"
                >
                  Show dirty and pending ranges
                </label>
                <div class="Controls__input">
                  <input
                    id="Controls__show-dirty-ranges"
                    type="checkbox"
                    checked={debug}
                    className="Input"
                    onClick={() => setDebugState(!debug)}
                  />
                </div>
              </div>
              <div className="Controls__row">
                <hr />
              </div> */}
              <div className="Controls__row">
                Select categories&nbsp;
                {isLoadingCategories && (
                  <span className="Sidebar__loading-spinner">|</span>
                )}
                <button
                  type="button"
                  class="Button flex-align-right"
                  onClick={this.fetchCategories}
                >
                  Refresh
                </button>
              </div>
              {this.state.allCategories.map(category => (
                <div className="Controls__row">
                  <label
                    className="Controls__label"
                    for="Controls__show-dirty-ranges"
                  >
                    {category.name}
                  </label>
                  <div class="Controls__input">
                    <input
                      id="Controls__show-dirty-ranges"
                      type="checkbox"
                      checked={
                        !!this.state.currentCategories.find(
                          _ => _.id === category.id
                        )
                      }
                      className="Input"
                      onInput={(e: Event) =>
                        this.setCategoryState(
                          category.id,
                          (e.target! as HTMLInputElement).checked
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              <div className="Controls__row">
                <hr />
              </div>
            </div>
          )}
          <div className="Controls__row">
            <button
              type="button"
              className="Button"
              onClick={this.requestMatchesForDocument}
            >
              Check whole document
            </button>
          </div>
        </div>
      </div>
    );
  }
  private handleNotify = (state: IPluginState<IMatch>) => {
    this.setState({ pluginState: state });
  };
  private toggleOpenState = () => this.setState({ isOpen: !this.state.isOpen });
  private setCategoryState = (categoryId: string, enabled: boolean) => {
    enabled
      ? this.props.addCategory(categoryId)
      : this.props.removeCategory(categoryId);
    this.setState({
      currentCategories: this.props.getCurrentCategories()
    });
  };

  private initCategories = async () => {
    const allCategories = await this.fetchCategories();
    if (!allCategories) {
      return;
    }
    this.setState({
      currentCategories: allCategories
    });
    allCategories.forEach(category => this.props.addCategory(category.id));
  };

  private fetchCategories = async () => {
    this.setState({ isLoadingCategories: true });
    try {
      const allCategories = await this.props.fetchCategories();
      this.setState({
        allCategories,
        isLoadingCategories: false
      });
      return allCategories;
    } catch (e) {
      this.setState({
        isLoadingCategories: false
      });
    }
  };

  private requestMatchesForDocument = () => {
    this.props.requestMatchesForDocument(
      v4(),
      this.props.getCurrentCategories().map(_ => _.id)
    );
  };
}

export default Controls;