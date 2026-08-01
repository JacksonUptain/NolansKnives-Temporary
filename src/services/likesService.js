import { get, off, onValue, ref, set } from 'firebase/database';
import { db } from '../pages/firebase';

export function getProductLikeState(productId, uid) {
  if (!productId || !uid) return Promise.resolve({ liked: false, count: 0, total: 0 });

  const likeRef = ref(db, `productLikes/${productId}`);
  return get(likeRef).then((snapshot) => {
    const value = snapshot.val() || {};
    const likedBy = Object.keys(value || {}).filter((key) => Boolean(value[key]));
    const liked = Boolean(value?.[uid]);
    return { liked, count: likedBy.length, total: likedBy.length };
  });
}

export function observeProductLikes(productId, callback) {
  if (!productId) return () => {};

  const likeRef = ref(db, `productLikes/${productId}`);
  const listener = onValue(likeRef, (snapshot) => {
    const value = snapshot.val() || {};
    const likedBy = Object.keys(value || {}).filter((key) => Boolean(value[key]));
    callback({ count: likedBy.length, likedBy });
  });

  return () => off(likeRef, 'value', listener);
}

export async function toggleProductLike(productId, uid, liked) {
  if (!productId || !uid) throw new Error('Login required to like products.');

  const likeRef = ref(db, `productLikes/${productId}/${uid}`);
  await set(likeRef, liked ? 1 : null);

  return { liked: liked, count: 0 };
}

export async function getUserLikedProducts(uid) {
  if (!uid) return [];

  const likesRef = ref(db, 'productLikes');
  const snapshot = await get(likesRef);
  const value = snapshot.val() || {};

  return Object.entries(value)
    .filter(([, users]) => Boolean(users?.[uid]))
    .map(([productId]) => productId);
}
