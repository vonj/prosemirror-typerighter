import v4 from "uuid/v4";
import {
  IBlock,
  IMatch
} from "../../interfaces/IMatch";
import { TMatchesReceivedCallback } from "../../interfaces/IMatcherAdapter";

/**
 * An example adapter that applies a regex to find three letter words in the document.
 */
const regexAdapter = async (
  input: IBlock,
  onMatchesReceived: TMatchesReceivedCallback
) => {
  const outputs = [] as IMatch[];
  const threeLetterExpr = /\b[a-zA-Z]{3}\b/g;
  const sixLetterExpr = /\b[a-zA-Z]{6}\b/g;
  let result;
  // tslint:disable-next-line no-conditional-assignment
  while ((result = threeLetterExpr.exec(input.text))) {
    outputs.push({
      from: input.from + result.index,
      to: input.from + result.index + result[0].length,
      text: result[0],
      annotation:
        "This word has three letters. Consider a larger, grander word.",
      id: v4(),
      category: {
        id: "word-length",
        name: "Word length",
        colour: "teal"
      },
      suggestions: [
        { text: "replace", type: "TEXT_SUGGESTION" },
        { text: "with", type: "TEXT_SUGGESTION" },
        { text: "grand", type: "TEXT_SUGGESTION" },
        { text: "word", type: "TEXT_SUGGESTION" }
      ]
    });
  }
  // tslint:disable-next-line no-conditional-assignment
  while ((result = sixLetterExpr.exec(input.text))) {
    outputs.push({
      from: input.from + result.index,
      to: input.from + result.index + result[0].length,
      text: result[0],
      annotation:
        "This word has six letters. Consider a smaller, less fancy word.",
      id: input.id,
      category: {
        id: "word-length",
        name: "Word length",
        colour: "teal"
      },
      suggestions: [
        { text: "replace", type: "TEXT_SUGGESTION" },
        { text: "with", type: "TEXT_SUGGESTION" },
        { text: "bijou", type: "TEXT_SUGGESTION" },
        { text: "word", type: "TEXT_SUGGESTION" }
      ]
    });
  }

  // Add some latency.
  await new Promise(_ => setTimeout(_, 1000));

  onMatchesReceived({
    id: input.id,
    blockQueries: outputs
  });
};

export default regexAdapter;
