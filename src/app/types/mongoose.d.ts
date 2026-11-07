import "mongoose";

declare module "mongoose" {
  export type FilterQuery<T> = ReturnType<typeof sanitizeFilter<T>>;
}
