import React, { useEffect, useRef, useState } from 'react';
import { PageInput, createPage, deletePage, fetchPage, fetchPagesList, updatePage, uploadImages } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { IconArrowDown, IconArrowUp, IconImage, IconPlus } from '../components/icons';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal, Spinner, formatDate } from '../components/ui';
import { ContentPageSummary, PageBlock, PageBlockType } from '../types';

/** A couple of slugs the website footer links to, offered as quick starters. */
const SUGGESTED = [
  { slug: 'terms', title: 'Terms & Conditions' },
  { slug: 'privacy', title: 'Privacy Policy' },
  { slug: 'about', title: 'About us' },
  { slug: 'refund', title: 'Refund & Cancellation' },
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export default function PagesPage() {
  const [pages, setPages] = useState<ContentPageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id?: string; starter?: { slug: string; title: string } } | null>(null);

  const load = () => {
    setLoading(true);
    fetchPagesList()
      .then(setPages)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (p: ContentPageSummary) => {
    if (!confirm(`Delete the page "${p.title}"?`)) return;
    try {
      await deletePage(p._id);
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const missing = SUGGESTED.filter((s) => !pages.some((p) => p.slug === s.slug));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Website Pages</h1>
          <div className="page-subtitle">
            Write content pages — Terms &amp; Conditions, Privacy Policy, About us and more — with headings, paragraphs and images.
            Published pages open on the website at <code>/p/&lt;address&gt;</code>; the footer links to <code>terms</code> and <code>privacy</code>.
          </div>
        </div>
        <Button onClick={() => setEditing({})}>
          <IconPlus size={16} /> New page
        </Button>
      </div>

      <ErrorBanner message={error} />

      {missing.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-pad">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Quick start</div>
            <div className="row-flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              {missing.map((s) => (
                <Button key={s.slug} variant="secondary" size="sm" onClick={() => setEditing({ starter: s })}>
                  + {s.title}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <CenterSpinner />
      ) : pages.length === 0 ? (
        <div className="card">
          <div className="empty-state">No pages yet. Create your Terms &amp; Conditions and Privacy Policy to start.</div>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Address</th>
                <th>Status</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p._id}>
                  <td style={{ fontWeight: 600 }}>{p.title}</td>
                  <td><code>/p/{p.slug}</code></td>
                  <td>{p.isPublished ? <Badge tone="success">Published</Badge> : <Badge tone="muted">Draft</Badge>}</td>
                  <td className="cell-muted">{formatDate(p.updatedAt)}</td>
                  <td>
                    <span className="row-flex" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: p._id })}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>Delete</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PageEditor
          id={editing.id}
          starter={editing.starter}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function PageEditor({
  id,
  starter,
  onClose,
  onSaved,
}: {
  id?: string;
  starter?: { slug: string; title: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(!!id);
  const [title, setTitle] = useState(starter?.title ?? '');
  const [slug, setSlug] = useState(starter?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!id || !!starter);
  const [metaDescription, setMetaDescription] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [blocks, setBlocks] = useState<PageBlock[]>(starter ? [{ type: 'text', text: '' }] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchPage(id)
      .then((p) => {
        setTitle(p.title);
        setSlug(p.slug);
        setMetaDescription(p.metaDescription ?? '');
        setIsPublished(p.isPublished);
        setBlocks(p.blocks.length ? p.blocks : [{ type: 'text', text: '' }]);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const onTitle = (v: string) => {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const setBlock = (i: number, patch: Partial<PageBlock>) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const addBlock = (type: PageBlockType) => setBlocks((bs) => [...bs, type === 'image' ? { type, image: '' } : { type, text: '' }]);
  const removeBlock = (i: number) => setBlocks((bs) => bs.filter((_, idx) => idx !== i));
  const moveBlock = (i: number, dir: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const copy = [...bs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = blocks.filter((b) => (b.type === 'image' ? b.image : (b.text ?? '').trim()));
    if (!title.trim()) return setError('Give the page a title.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return setError('The address can use lowercase letters, numbers and dashes only.');
    if (!clean.length) return setError('Add at least one heading, paragraph or image.');
    setSaving(true);
    setError('');
    const body: PageInput = { title: title.trim(), slug, metaDescription: metaDescription.trim() || undefined, isPublished, blocks: clean };
    try {
      if (id) await updatePage(id, body);
      else await createPage(body);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={id ? 'Edit page' : 'New page'} onClose={onClose} wide>
      {loading ? (
        <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <form onSubmit={submit}>
          <ErrorBanner message={error} />
          <div className="field-row">
            <Field label="Page title">
              <input value={title} onChange={(e) => onTitle(e.target.value)} maxLength={140} placeholder="Terms & Conditions" required />
            </Field>
            <Field label="Address (slug)">
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                maxLength={80}
                placeholder="terms"
                required
              />
            </Field>
          </div>
          <Field label="Search description (optional)">
            <input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} maxLength={300} placeholder="A short summary shown in search results" />
          </Field>

          <div className="field">
            <label>Content</label>
            <div style={{ display: 'grid', gap: 10 }}>
              {blocks.map((b, i) => (
                <BlockEditor
                  key={i}
                  block={b}
                  index={i}
                  total={blocks.length}
                  onChange={(patch) => setBlock(i, patch)}
                  onRemove={() => removeBlock(i)}
                  onMove={(dir) => moveBlock(i, dir)}
                  onError={setError}
                />
              ))}
            </div>
            <div className="row-flex" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Button type="button" variant="secondary" size="sm" onClick={() => addBlock('heading')}>+ Heading</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => addBlock('text')}>+ Paragraph</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => addBlock('image')}>+ Image</Button>
            </div>
          </div>

          <Field label="Status">
            <div className="checkbox-row">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} id="page-pub" />
              <label htmlFor="page-pub" style={{ marginBottom: 0 }}>
                Published (visible on the website)
              </label>
            </div>
          </Field>

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save page'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function BlockEditor({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  onError,
}: {
  block: PageBlock;
  index: number;
  total: number;
  onChange: (patch: Partial<PageBlock>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onError: (msg: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const [url] = await uploadImages([file]);
      onChange({ image: url });
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const typeLabel = block.type === 'heading' ? 'Heading' : block.type === 'image' ? 'Image' : 'Paragraph';

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-pad" style={{ padding: 12 }}>
        <div className="row-flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <Badge tone="muted">{typeLabel}</Badge>
          <span className="row-flex" style={{ gap: 4 }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">
              <IconArrowUp size={14} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">
              <IconArrowDown size={14} />
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>Remove</button>
          </span>
        </div>

        {block.type === 'heading' && (
          <input value={block.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} maxLength={200} placeholder="Section heading" />
        )}
        {block.type === 'text' && (
          <textarea value={block.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} rows={5} placeholder="Write the paragraph text here…" />
        )}
        {block.type === 'image' && (
          <div>
            <div className="banner-preview banner-preview-lg" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
              {block.image ? (
                <img src={block.image} alt={block.alt ?? ''} />
              ) : (
                <div className="banner-preview-empty">
                  <IconImage size={26} />
                  <span>{uploading ? 'Uploading…' : 'Click to upload'}</span>
                </div>
              )}
            </div>
            <div className="row-flex" style={{ marginTop: 8, gap: 8 }}>
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : block.image ? 'Replace' : 'Upload'}
              </Button>
              <input value={block.alt ?? ''} onChange={(e) => onChange({ alt: e.target.value })} placeholder="Image description (alt text)" style={{ flex: 1, fontSize: 12.5 }} />
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onFileChosen} />
          </div>
        )}
      </div>
    </div>
  );
}
