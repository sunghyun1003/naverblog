// Public destinations only. Never accept an arbitrary URL from a job.
export function validateTarget(target) {
  if (!target || typeof target.blogId !== "string" || !/^[a-zA-Z0-9_-]{2,50}$/.test(target.blogId)) throw new Error("블로그 ID 형식이 올바르지 않습니다.");
  if (target.profileVersion !== undefined && target.profileVersion !== 2) throw new Error("PC 연결을 다시 설정해주세요.");
  if (target.category != null && (typeof target.category.id !== "string" || !/^[1-9][0-9]{0,8}$/.test(target.category.id)
    || typeof target.category.name !== "string" || !target.category.name.trim()
    || target.category.name.length > 100 || /[\u0000-\u001f\u007f]/.test(target.category.name))) {
    throw new Error("카테고리 번호와 이름을 확인해주세요.");
  }
  return target;
}

export function writeUrl(target, withCategory = true) {
  validateTarget(target);
  if (withCategory && target.category) {
    // This is Naver's observed '글쓰기' link for a selected category.
    return `https://blog.naver.com/${encodeURIComponent(target.blogId)}/postwrite?categoryNo=${target.category.id}`;
  }
  return `https://blog.naver.com/PostWriteForm.naver?blogId=${encodeURIComponent(target.blogId)}`;
}

export function editorBlogId(value) {
  try {
    const url = new URL(value);
    if (url.origin !== "https://blog.naver.com") return null;
    if (url.pathname === "/PostWriteForm.naver") return url.searchParams.get("blogId");
    const match = url.pathname.match(/^\/([a-zA-Z0-9_-]{2,50})\/postwrite\/?$/);
    return match?.[1] ?? null;
  } catch { return null; }
}

export function categoryListUrl(target) {
  validateTarget(target);
  if (!target.category) throw new Error("카테고리 정보가 없습니다.");
  return `https://blog.naver.com/PostList.naver?blogId=${target.blogId}&categoryNo=${target.category.id}`;
}

export function assertCategoryLink(target, name, href) {
  validateTarget(target);
  let url;
  try { url = new URL(href, "https://blog.naver.com"); } catch { throw new Error("카테고리 주소를 확인하지 못했습니다."); }
  if (!target.category || url.origin !== "https://blog.naver.com" || url.pathname !== "/PostList.naver"
    || url.searchParams.get("blogId") !== target.blogId || url.searchParams.get("categoryNo") !== target.category.id
    || name?.trim().normalize("NFC") !== target.category.name.trim().normalize("NFC")) {
    throw new Error("네이버 카테고리 번호·이름이 연결 설정과 다릅니다. 입력하지 않았습니다.");
  }
}

export function sameTarget(left, right) {
  validateTarget(left); validateTarget(right);
  return left.blogId === right.blogId && (left.category?.id ?? null) === (right.category?.id ?? null)
    && (left.category?.name ?? null) === (right.category?.name ?? null);
}

export function profileParts(device) {
  validateTarget(device);
  // Old installations keep working. Newly paired devices isolate the new
  // account without deleting or copying cookies from the old Chrome profile.
  return device.profileVersion === 2 ? ["naver-profiles", device.blogId] : ["naver-profile"];
}

export const categoryDescription = target => target.category ? `${target.category.name} (${target.category.id})` : "기본 카테고리";
