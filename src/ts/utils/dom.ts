import { IStateHoverInfo } from "../state/reducer";

/**
 * Strip any HTML from an input string.
 */
export const stripHtml = (text: string) => {
  const decoder = document.createElement('div')
  decoder.innerHTML = text
  return decoder.textContent || ''
}

/**
 * Find the first ancestor node of the given node that matches the selector.
 */
export function findAncestor(
  element: HTMLElement,
  selector: (e: HTMLElement) => boolean
) {
  // tslint:disable-next-line prefer-const
  let currentElement: HTMLElement | null = element;
  while (
    // tslint:disable-next-line no-conditional-assignment
    (currentElement = currentElement.parentElement) &&
    !selector(currentElement)
    // tslint:disable-next-line no-empty
  ) {}
  return currentElement;
}

/**
 * Get the dimensions required for our UI code to render a tooltip. We encapsulate this here
 * to avoid dealing with side effects in the plugin reducer.
 */
export function getStateHoverInfoFromEvent(
  event: MouseEvent,
  containerElement: Element | null,
  heightMarkerElement: Element | null
): IStateHoverInfo | undefined {
  if (
    !event.target ||
    !(event.target instanceof HTMLElement) ||
    !containerElement ||
    !(containerElement instanceof HTMLElement) ||
    !heightMarkerElement ||
    !(heightMarkerElement instanceof HTMLElement)
  ) {
    return;
  }
  const {
    left: containerLeft,
    top: containerTop
  } = containerElement.getBoundingClientRect();
  const mouseOffsetX = event.clientX;
  const mouseOffsetY = event.clientY;
  const { offsetLeft, offsetTop, offsetHeight: height } = event.target;
  return {
    containerLeft,
    containerTop,
    offsetLeft,
    offsetTop,
    height,
    mouseClientX: mouseOffsetX,
    mouseClientY: mouseOffsetY,
    markerClientRects: event.target.getClientRects()
  };
}
