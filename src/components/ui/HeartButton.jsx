import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { observeProductLikes, toggleProductLike } from '../../services/likesService';
import { showToast } from '../Toast';

export default function HeartButton({ product, className = '', compact = false, onChange }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [count, setCount] = useState(0);
  const [likedBy, setLikedBy] = useState([]);
  const [busy, setBusy] = useState(false);

  const productId = product?.id || product?.productId || product?.key;
  const likesVisible = product?.likesVisible !== false;

  useEffect(() => {
    if (!productId) {
      setCount(0);
      setLikedBy([]);
      return undefined;
    }

    const unsubscribe = observeProductLikes(productId, ({ count: nextCount, likedBy: nextLikedBy }) => {
      setCount(nextCount);
      setLikedBy(nextLikedBy || []);
    });

    return unsubscribe;
  }, [productId]);

  const liked = Boolean(user?.uid && likedBy.includes(user.uid));
  const canInteract = useMemo(() => Boolean(user?.uid && profile?.status !== 'blocked'), [user?.uid, profile?.status]);

  const handleToggle = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!productId || busy) return;

    if (!canInteract) {
      if (!user?.uid) {
        showToast('Sign in to like this piece.', 'info');
        navigate('/account', { state: { from: `${location.pathname}${location.search}` } });
      } else {
        showToast('Your account cannot like items right now.', 'info');
      }
      return;
    }

    const nextLiked = !liked;
    setBusy(true);
    try {
      await toggleProductLike(productId, user.uid, nextLiked);
      onChange?.({ liked: nextLiked });
    } catch (error) {
      console.error('Failed to toggle like', error);
      showToast('Could not save your like. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!likesVisible) return null;

  const iconSize = compact ? 15 : 18;

  return (
    <button
      type="button"
      className={`nk-heart-button ${liked ? 'is-liked' : ''} ${compact ? 'compact' : ''} ${className}`.trim()}
      onClick={handleToggle}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? 'Remove like' : 'Like this piece'}
    >
      <span className="nk-heart-icon" style={{ width: iconSize, height: iconSize }} aria-hidden="true">
        <Heart size={iconSize} strokeWidth={1.8} className="nk-heart-outline" />
        <Heart size={iconSize} strokeWidth={1.8} fill="currentColor" className="nk-heart-fill" />
      </span>
      {!compact && <span>{count}</span>}
    </button>
  );
}
