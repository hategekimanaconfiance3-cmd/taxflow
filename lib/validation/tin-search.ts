import { z } from "zod";

/** TINs are identifiers: preserve them as trimmed strings, including leading zeroes. */
export const tinSearchInputSchema = z
  .string()
  .trim()
  .min(5)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/);

export const TIN_SEARCH_INPUT_MESSAGE = "Enter a valid TIN using 5 to 32 letters, numbers, or hyphens.";
