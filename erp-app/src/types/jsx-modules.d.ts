declare module "*.jsx" {
  import type { FC } from "react";
  const C: FC<Record<string, unknown>>;
  export default C;
}
