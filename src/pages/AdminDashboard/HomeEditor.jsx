import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, push, remove, serverTimestamp, set, update } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { showToast } from '../../components/Toast';
import { showConfirm } from '../../components/ConfirmDialog';
import LucideIcon from '../../components/ui/LucideIcon';
import '../AdminDashboard.css';

const emptyCard = {
  title: '',
  text: '',
  hrefText: 'Learn More',
  href: '/store',
  src: '',
  sortOrder: '',
  isVisible: true
};

const emptySlide = {
  name: '',
  caption: '',
  src: '',
  interval: 3500,
  sortOrder: '',
  isVisible: true
};

function normalizeImages(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function primaryImage(value) {
  return normalizeImages(value)[0] || '';
}

function normalizeList(snapshotValue) {
  if (!snapshotValue) return [];
  return Object.entries(snapshotValue)
    .filter(([, value]) => Boolean(value))
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || (a.title || a.name || '').localeCompare(b.title || b.name || ''));
}

function draftValue(drafts, item, field) {
  const value = drafts[item.id]?.[field] ?? item[field] ?? '';
  return field === 'src' && Array.isArray(value) ? value.join(', ') : value;
}

function toImageArray(value) {
  const images = normalizeImages(value);
  return images.length > 1 ? images : images[0] || '';
}

export default function HomeEditor() {
  const [cards, setCards] = useState([]);
  const [slides, setSlides] = useState([]);
  const [cardDrafts, setCardDrafts] = useState({});
  const [slideDrafts, setSlideDrafts] = useState({});
  const [newCard, setNewCard] = useState(emptyCard);
  const [newSlide, setNewSlide] = useState(emptySlide);
  const [activeTab, setActiveTab] = useState('cards');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [uploadingKey, setUploadingKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cardsLoaded = false;
    let slidesLoaded = false;

    const done = () => {
      if (cardsLoaded && slidesLoaded) setLoading(false);
    };

    const unsubCards = onValue(ref(db, 'Home'), (snapshot) => {
      setCards(normalizeList(snapshot.val()));
      cardsLoaded = true;
      done();
    }, (err) => {
      setError(err?.message || 'Failed to load home cards');
      cardsLoaded = true;
      done();
    });

    const unsubSlides = onValue(ref(db, 'HomeCarousel'), (snapshot) => {
      setSlides(normalizeList(snapshot.val()));
      slidesLoaded = true;
      done();
    }, (err) => {
      setError(err?.message || 'Failed to load carousel slides');
      slidesLoaded = true;
      done();
    });

    return () => {
      unsubCards();
      unsubSlides();
    };
  }, []);

  const stats = useMemo(() => ({
    cards: cards.length,
    visibleCards: cards.filter((item) => item.isVisible !== false).length,
    slides: slides.length,
    visibleSlides: slides.filter((item) => item.isVisible !== false).length
  }), [cards, slides]);

  const setDraft = (type, id, field, value) => {
    const setter = type === 'card' ? setCardDrafts : setSlideDrafts;
    setter((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  const uploadImage = async (event, type, id = '') => {
    const file = event.target.files?.[0];
    if (!file) return;

    const key = `${type}-${id || 'new'}`;
    setUploadingKey(key);
    setError('');

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const fileRef = storageRef(storage, `home/${type}/${Date.now()}-${safeName}`);
      const snapshot = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(snapshot.ref);

      if (!id) {
        if (type === 'card') setNewCard((prev) => ({ ...prev, src: url }));
        if (type === 'slide') setNewSlide((prev) => ({ ...prev, src: url }));
      } else {
        setDraft(type, id, 'src', url);
      }

      showToast('Image uploaded.', 'success');
    } catch (err) {
      const message = err?.message || 'Image upload failed.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setUploadingKey('');
      event.target.value = '';
    }
  };

  const createCard = async (event) => {
    event.preventDefault();
    if (!newCard.title.trim()) {
      showToast('Card title is required.', 'error');
      return;
    }

    try {
      setSavingKey('new-card');
      const cardRef = push(ref(db, 'Home'));
      await set(cardRef, {
        title: newCard.title.trim(),
        text: newCard.text.trim(),
        hrefText: newCard.hrefText.trim() || 'Learn More',
        href: newCard.href.trim() || '/store',
        src: toImageArray(newCard.src),
        sortOrder: Number(newCard.sortOrder || cards.length),
        isVisible: newCard.isVisible !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewCard(emptyCard);
      showToast('Home card created.', 'success');
    } catch (err) {
      const message = err?.message || 'Failed to create home card.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingKey('');
    }
  };

  const createSlide = async (event) => {
    event.preventDefault();
    if (!newSlide.name.trim() || !newSlide.src.trim()) {
      showToast('Slide title and image are required.', 'error');
      return;
    }

    try {
      setSavingKey('new-slide');
      const slideRef = push(ref(db, 'HomeCarousel'));
      await set(slideRef, {
        name: newSlide.name.trim(),
        caption: newSlide.caption.trim(),
        src: newSlide.src.trim(),
        interval: Number(newSlide.interval || 3500),
        sortOrder: Number(newSlide.sortOrder || slides.length),
        isVisible: newSlide.isVisible !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewSlide(emptySlide);
      showToast('Carousel slide created.', 'success');
    } catch (err) {
      const message = err?.message || 'Failed to create carousel slide.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingKey('');
    }
  };

  const saveCard = async (card) => {
    const draft = cardDrafts[card.id] || {};
    try {
      setSavingKey(`card-${card.id}`);
      await update(ref(db, `Home/${card.id}`), {
        title: draft.title ?? card.title ?? '',
        text: draft.text ?? card.text ?? '',
        hrefText: draft.hrefText ?? card.hrefText ?? 'Learn More',
        href: draft.href ?? card.href ?? '/store',
        src: toImageArray(draft.src ?? card.src ?? ''),
        sortOrder: Number(draft.sortOrder ?? card.sortOrder ?? 0),
        isVisible: draft.isVisible ?? card.isVisible ?? true,
        updatedAt: serverTimestamp()
      });
      setCardDrafts((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
      showToast('Home card saved.', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to save home card.', 'error');
    } finally {
      setSavingKey('');
    }
  };

  const saveSlide = async (slide) => {
    const draft = slideDrafts[slide.id] || {};
    try {
      setSavingKey(`slide-${slide.id}`);
      await update(ref(db, `HomeCarousel/${slide.id}`), {
        name: draft.name ?? slide.name ?? '',
        caption: draft.caption ?? slide.caption ?? '',
        src: draft.src ?? slide.src ?? '',
        interval: Number(draft.interval ?? slide.interval ?? 3500),
        sortOrder: Number(draft.sortOrder ?? slide.sortOrder ?? 0),
        isVisible: draft.isVisible ?? slide.isVisible ?? true,
        updatedAt: serverTimestamp()
      });
      setSlideDrafts((prev) => {
        const next = { ...prev };
        delete next[slide.id];
        return next;
      });
      showToast('Carousel slide saved.', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to save carousel slide.', 'error');
    } finally {
      setSavingKey('');
    }
  };

  const duplicateItem = async (type, item) => {
    const collection = type === 'card' ? 'Home' : 'HomeCarousel';
    const titleField = type === 'card' ? 'title' : 'name';
    const copy = {
      ...item,
      [titleField]: `${item[titleField] || 'Untitled'} Copy`,
      sortOrder: Number(item.sortOrder || 0) + 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    delete copy.id;
    await set(push(ref(db, collection)), copy);
    showToast(type === 'card' ? 'Card duplicated.' : 'Slide duplicated.', 'success');
  };

  const deleteItem = async (type, item) => {
    const collection = type === 'card' ? 'Home' : 'HomeCarousel';
    const label = item.title || item.name || 'this item';
    await showConfirm(
      type === 'card' ? 'Delete Home Card' : 'Delete Carousel Slide',
      `Delete "${label}"? This cannot be undone.`,
      async () => {
        await remove(ref(db, `${collection}/${item.id}`));
        showToast(type === 'card' ? 'Card deleted.' : 'Slide deleted.', 'success');
      }
    );
  };

  const moveItem = async (type, list, index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const collection = type === 'card' ? 'Home' : 'HomeCarousel';
    const current = list[index];
    const target = list[targetIndex];
    await update(ref(db), {
      [`${collection}/${current.id}/sortOrder`]: Number(target.sortOrder ?? targetIndex),
      [`${collection}/${target.id}/sortOrder`]: Number(current.sortOrder ?? index),
      [`${collection}/${current.id}/updatedAt`]: serverTimestamp(),
      [`${collection}/${target.id}/updatedAt`]: serverTimestamp()
    });
  };

  if (loading) return <div className="admin-dashboard-page"><div className="loading-shimmer">Loading home editor...</div></div>;

  return (
    <div className="admin-dashboard-page home-editor-page">
      <div className="dashboard-header admin-users-header">
        <div>
          <h1>Home Editor</h1>
          <p>Manage the home page carousel, cards, images, copy, and button destinations.</p>
        </div>
        <a className="action-btn secondary" href="/" target="_blank" rel="noreferrer">
          <LucideIcon name="ExternalLink" size={16} /> View Home
        </a>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="workspace-stats admin-stat-row">
        <div className="stat-card compact"><span>Cards</span><strong>{stats.visibleCards}/{stats.cards}</strong></div>
        <div className="stat-card compact"><span>Slides</span><strong>{stats.visibleSlides}/{stats.slides}</strong></div>
      </div>

      <div className="editor-tabs">
        <button className={activeTab === 'cards' ? 'active' : ''} onClick={() => setActiveTab('cards')}>Cards</button>
        <button className={activeTab === 'carousel' ? 'active' : ''} onClick={() => setActiveTab('carousel')}>Carousel</button>
      </div>

      {activeTab === 'cards' && (
        <>
          <form className="editor-create-panel" onSubmit={createCard}>
            <h2>Create Home Card</h2>
            {primaryImage(newCard.src) && (
              <div className="editor-preview editor-preview-new">
                <img src={primaryImage(newCard.src)} alt="New card preview" />
              </div>
            )}
            <input className="input-field" placeholder="Title" value={newCard.title} onChange={(e) => setNewCard((prev) => ({ ...prev, title: e.target.value }))} required />
            <textarea className="input-field" placeholder="Body copy" value={newCard.text} onChange={(e) => setNewCard((prev) => ({ ...prev, text: e.target.value }))} />
            <input className="input-field" placeholder="Button text" value={newCard.hrefText} onChange={(e) => setNewCard((prev) => ({ ...prev, hrefText: e.target.value }))} />
            <input className="input-field" placeholder="Button link" value={newCard.href} onChange={(e) => setNewCard((prev) => ({ ...prev, href: e.target.value }))} />
            <input className="input-field" placeholder="Image URL or comma-separated URLs" value={newCard.src} onChange={(e) => setNewCard((prev) => ({ ...prev, src: e.target.value }))} />
            <input className="input-field" type="number" placeholder="Sort order" value={newCard.sortOrder} onChange={(e) => setNewCard((prev) => ({ ...prev, sortOrder: e.target.value }))} />
            <label className="editor-check"><input type="checkbox" checked={newCard.isVisible} onChange={(e) => setNewCard((prev) => ({ ...prev, isVisible: e.target.checked }))} /> Visible</label>
            <label className="action-btn secondary file-action">
              <LucideIcon name="Upload" size={16} /> {uploadingKey === 'card-new' ? 'Uploading...' : 'Upload Image'}
              <input type="file" accept="image/*" onChange={(e) => uploadImage(e, 'card')} disabled={uploadingKey === 'card-new'} />
            </label>
            <button className="action-btn" disabled={savingKey === 'new-card'}>
              <LucideIcon name="Plus" size={16} /> {savingKey === 'new-card' ? 'Creating...' : 'Create Card'}
            </button>
          </form>

          <div className="editor-list">
            {cards.map((card, index) => {
              const image = primaryImage(draftValue(cardDrafts, card, 'src'));
              return (
                <article className="editor-item" key={card.id}>
                  <div className="editor-preview">
                    {image ? <img src={image} alt={draftValue(cardDrafts, card, 'title') || 'Home card'} /> : <div><LucideIcon name="Image" /> No image</div>}
                  </div>
                  <div className="editor-fields">
                    <input className="input-field" value={draftValue(cardDrafts, card, 'title')} onChange={(e) => setDraft('card', card.id, 'title', e.target.value)} />
                    <textarea className="input-field" value={draftValue(cardDrafts, card, 'text')} onChange={(e) => setDraft('card', card.id, 'text', e.target.value)} />
                    <div className="editor-grid-3">
                      <input className="input-field" value={draftValue(cardDrafts, card, 'hrefText')} onChange={(e) => setDraft('card', card.id, 'hrefText', e.target.value)} />
                      <input className="input-field" value={draftValue(cardDrafts, card, 'href')} onChange={(e) => setDraft('card', card.id, 'href', e.target.value)} />
                      <input className="input-field" type="number" value={draftValue(cardDrafts, card, 'sortOrder')} onChange={(e) => setDraft('card', card.id, 'sortOrder', e.target.value)} />
                    </div>
                    <input className="input-field" value={draftValue(cardDrafts, card, 'src')} onChange={(e) => setDraft('card', card.id, 'src', e.target.value)} />
                    <div className="editor-actions">
                      <label className="editor-check"><input type="checkbox" checked={draftValue(cardDrafts, card, 'isVisible') !== false} onChange={(e) => setDraft('card', card.id, 'isVisible', e.target.checked)} /> Visible</label>
                      <label className="action-btn secondary file-action">
                        <LucideIcon name="Upload" size={15} /> {uploadingKey === `card-${card.id}` ? 'Uploading...' : 'Upload'}
                        <input type="file" accept="image/*" onChange={(e) => uploadImage(e, 'card', card.id)} disabled={uploadingKey === `card-${card.id}`} />
                      </label>
                      <button className="action-btn secondary" onClick={() => moveItem('card', cards, index, -1)} disabled={index === 0}><LucideIcon name="ArrowUp" size={15} /></button>
                      <button className="action-btn secondary" onClick={() => moveItem('card', cards, index, 1)} disabled={index === cards.length - 1}><LucideIcon name="ArrowDown" size={15} /></button>
                      <button className="action-btn secondary" onClick={() => duplicateItem('card', card)}><LucideIcon name="Copy" size={15} /> Duplicate</button>
                      <button className="action-btn" onClick={() => saveCard(card)} disabled={savingKey === `card-${card.id}`}><LucideIcon name="Save" size={15} /> Save</button>
                      <button className="action-btn danger" onClick={() => deleteItem('card', card)}><LucideIcon name="Trash2" size={15} /> Delete</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {activeTab === 'carousel' && (
        <>
          <form className="editor-create-panel" onSubmit={createSlide}>
            <h2>Create Carousel Slide</h2>
            {newSlide.src && (
              <div className="editor-preview editor-preview-new wide">
                <img src={newSlide.src} alt="New slide preview" />
              </div>
            )}
            <input className="input-field" placeholder="Slide title" value={newSlide.name} onChange={(e) => setNewSlide((prev) => ({ ...prev, name: e.target.value }))} required />
            <input className="input-field" placeholder="Caption" value={newSlide.caption} onChange={(e) => setNewSlide((prev) => ({ ...prev, caption: e.target.value }))} />
            <input className="input-field" placeholder="Image URL" value={newSlide.src} onChange={(e) => setNewSlide((prev) => ({ ...prev, src: e.target.value }))} required />
            <input className="input-field" type="number" placeholder="Interval ms" value={newSlide.interval} onChange={(e) => setNewSlide((prev) => ({ ...prev, interval: e.target.value }))} />
            <input className="input-field" type="number" placeholder="Sort order" value={newSlide.sortOrder} onChange={(e) => setNewSlide((prev) => ({ ...prev, sortOrder: e.target.value }))} />
            <label className="editor-check"><input type="checkbox" checked={newSlide.isVisible} onChange={(e) => setNewSlide((prev) => ({ ...prev, isVisible: e.target.checked }))} /> Visible</label>
            <label className="action-btn secondary file-action">
              <LucideIcon name="Upload" size={16} /> {uploadingKey === 'slide-new' ? 'Uploading...' : 'Upload Image'}
              <input type="file" accept="image/*" onChange={(e) => uploadImage(e, 'slide')} />
            </label>
            <button className="action-btn" disabled={savingKey === 'new-slide'}>
              <LucideIcon name="Plus" size={16} /> {savingKey === 'new-slide' ? 'Creating...' : 'Create Slide'}
            </button>
          </form>

          <div className="editor-list">
            {slides.map((slide, index) => (
              <article className="editor-item" key={slide.id}>
                <div className="editor-preview wide">
                  {draftValue(slideDrafts, slide, 'src') ? <img src={draftValue(slideDrafts, slide, 'src')} alt={draftValue(slideDrafts, slide, 'name') || 'Carousel slide'} /> : <div><LucideIcon name="Image" /> No image</div>}
                </div>
                <div className="editor-fields">
                  <div className="editor-grid-3">
                    <input className="input-field" value={draftValue(slideDrafts, slide, 'name')} onChange={(e) => setDraft('slide', slide.id, 'name', e.target.value)} />
                    <input className="input-field" value={draftValue(slideDrafts, slide, 'caption')} onChange={(e) => setDraft('slide', slide.id, 'caption', e.target.value)} />
                    <input className="input-field" type="number" value={draftValue(slideDrafts, slide, 'interval')} onChange={(e) => setDraft('slide', slide.id, 'interval', e.target.value)} />
                  </div>
                  <div className="editor-grid-3">
                    <input className="input-field editor-grid-span-2" value={draftValue(slideDrafts, slide, 'src')} onChange={(e) => setDraft('slide', slide.id, 'src', e.target.value)} />
                    <input className="input-field" type="number" value={draftValue(slideDrafts, slide, 'sortOrder')} onChange={(e) => setDraft('slide', slide.id, 'sortOrder', e.target.value)} />
                  </div>
                  <div className="editor-actions">
                    <label className="editor-check"><input type="checkbox" checked={draftValue(slideDrafts, slide, 'isVisible') !== false} onChange={(e) => setDraft('slide', slide.id, 'isVisible', e.target.checked)} /> Visible</label>
                    <label className="action-btn secondary file-action">
                      <LucideIcon name="Upload" size={15} /> {uploadingKey === `slide-${slide.id}` ? 'Uploading...' : 'Upload'}
                      <input type="file" accept="image/*" onChange={(e) => uploadImage(e, 'slide', slide.id)} disabled={uploadingKey === `slide-${slide.id}`} />
                    </label>
                    <button className="action-btn secondary" onClick={() => moveItem('slide', slides, index, -1)} disabled={index === 0}><LucideIcon name="ArrowUp" size={15} /></button>
                    <button className="action-btn secondary" onClick={() => moveItem('slide', slides, index, 1)} disabled={index === slides.length - 1}><LucideIcon name="ArrowDown" size={15} /></button>
                    <button className="action-btn secondary" onClick={() => duplicateItem('slide', slide)}><LucideIcon name="Copy" size={15} /> Duplicate</button>
                    <button className="action-btn" onClick={() => saveSlide(slide)} disabled={savingKey === `slide-${slide.id}`}><LucideIcon name="Save" size={15} /> Save</button>
                    <button className="action-btn danger" onClick={() => deleteItem('slide', slide)}><LucideIcon name="Trash2" size={15} /> Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
