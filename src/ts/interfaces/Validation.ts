export type Range = { from: number; to: number };

export type ValidationInput = { str: string; from: number; to: number };

export type ValidationOutput = ValidationInput & {
  annotation: string;
  suggestions?: string[];
  type: string;
  id: string;
};

export type ValidationError = {
  validationInput: ValidationInput;
  id: string | number;
  message: string;
};

export type ValidationResponse = {
  validationOutputs: ValidationOutput[];
  id: string;
};

export type ValidationLibrary = {
  regExp: RegExp;
  annotation: string;
  operation: "ANNOTATE" | "REPLACE";
  type: string;
}[][];

export const Operations: {
  [key: string]: "ANNOTATE" | "REPLACE";
} = {
  ANNOTATE: "ANNOTATE",
  REPLACE: "REPLACE"
};
