import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { observeProductLikes, toggleProductLike } from '../../services/likesService';
import LucideIcon from './LucideIcon';

export default function HeartButton({ product, className = '', compact = false, onChange }) {
  const { user, profile } = useAuth();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const productId = product?.id || product?.productId || product?.key;

  useEffect(() => {
    if (!productId || !user?.uid) {
      setLiked(false);
      setCount(0);
      return undefined;
    }

    const unsubscribe = observeProductLikes(productId, ({ count: nextCount }) => {
      setCount(nextCount);
    });

    let active = true;
    import('../../services/likesService').then(({ getProductLikeState }) => {
      if (!active) return;
      getProductLikeState(productId, user.uid).then((state) => {
        if (!active) return;
        setLiked(Boolean(state.liked));
        setCount(Number(state.count || 0));
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [productId, user?.uid]);

  const canInteract = useMemo(() => Boolean(user?.uid && profile?.status !== 'blocked'), [user?.uid, profile?.status]);

  const handleToggle = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!canInteract || busy || !productId) return;

    const nextLiked = !liked;
    try {
      setBusy(true);
      await toggleProductLike(productId, user.uid, nextLiked);
      setLiked(nextLiked);
      setCount((current) => current + (nextLiked ? 1 : -1));
      onChange?.({ liked: nextLiked, count: count + (nextLiked ? 1 : -1) });
    } catch (error) {
      console.error('Failed to toggle like', error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`nk-heart-button ${liked ? 'is-liked' : ''} ${compact ? 'compact' : ''} ${className}`.trim()}
      onClick={handleToggle}
      disabled={!canInteract || busy}
      aria-label={liked ? 'Remove like' : 'Like this piece'}
    >
      <LucideIcon name="Heart" size={compact ? 15 : 18} />
      {!compact && <span>{count}</span>}
    </button>
  );
}
