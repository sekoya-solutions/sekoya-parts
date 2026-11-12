import { revalidateTag } from "next/cache";

// expire: 0 so the next request waits for the new content and no visitor sees
// the old value (docs/adr/0008-caching-and-partial-refresh.md).
export const refresh = (tags: string[]) => {
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
};
