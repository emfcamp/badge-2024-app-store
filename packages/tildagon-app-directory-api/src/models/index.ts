export type Result<Success, Error> =
  | { type: "success"; value: Success }
  | { type: "failure"; failure: Error };

export const Result = {
  isOk<T>(result: Result<T, any>): result is { type: "success"; value: T } {
    return result.type === "success";
  },
  isNotOk<T>(
    result: Result<any, T>,
  ): result is { type: "failure"; failure: T } {
    return result.type === "failure";
  },
  Ok<T>(value: T): Result<T, any> {
    return { type: "success", value: value };
  },
};

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
