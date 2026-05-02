import { ApiClientError } from "./api";

export function apiMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong";
}
