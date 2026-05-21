import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Megaphone, ImagePlus, Save, X } from "lucide-react";

function resolveImg(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("//")) return url;
  return `${process.env.REACT_APP_BACKEND_URL}${url}`;
}

export default function AdminAnnouncements() {
  const [s, setS] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/admin/settings").then(({ data }) => setS(data));
  }, []);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setS((p) => ({ ...p, home_announcement_image_url: data.url }));
      toast.success("Image uploaded");
    } catch { toast.error("Upload failed"); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.put("/admin/settings", {
        home_announcement: s.home_announcement || "",
        home_announcement_active: !!s.home_announcement_active,
        home_announcement_image_url: s.home_announcement_image_url || "",
        welcome_message: s.welcome_message || "",
        welcome_modal_title: s.welcome_modal_title || "",
        welcome_modal_active: s.welcome_modal_active !== false,
        telegram_url: s.telegram_url || "",
      });
      setS(data);
      toast.success("Announcements saved");
    } catch { toast.error("Save failed"); }
  };

  if (!s) return <AdminLayout title="Announcements"><div className="text-[color:var(--text-secondary)]">Loading…</div></AdminLayout>;

  return (
    <AdminLayout title="Announcements">
      <div className="text-label">Push messages to every user</div>
      <p className="text-sm text-[color:var(--text-secondary)] mt-1">Manage the home announcement banner and the welcome modal that greets every user.</p>

      <form onSubmit={save} className="space-y-5 mt-5 max-w-3xl" data-testid="announcements-form">
        <div className="card-soft p-6">
          <div className="flex items-center justify-between">
            <div className="text-label flex items-center gap-2"><Megaphone className="w-3.5 h-3.5 text-[color:var(--accent-main)]" /> Home banner</div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={!!s.home_announcement_active}
                onChange={(e) => setS({ ...s, home_announcement_active: e.target.checked })}
                data-testid="ann-active" />
              <span className="text-[color:var(--text-secondary)]">Active</span>
            </label>
          </div>
          <textarea rows={3} value={s.home_announcement || ""}
            onChange={(e) => setS({ ...s, home_announcement: e.target.value })}
            placeholder="Weekend bonus: top-up ₦20,000 and get an extra 5%!"
            data-testid="ann-text"
            className="w-full mt-2 input-base resize-none" />
          <div className="mt-3 flex items-start gap-3">
            <div className="w-32 h-20 rounded-xl border border-dashed border-[color:var(--border-default)] bg-[color:var(--surface-alt)] flex items-center justify-center overflow-hidden shrink-0">
              {s.home_announcement_image_url
                ? <img src={resolveImg(s.home_announcement_image_url)} alt="ann" className="w-full h-full object-cover" />
                : <ImagePlus className="w-5 h-5 text-[color:var(--text-tertiary)]" />}
            </div>
            <div className="flex-1 flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                data-testid="ann-upload"
                className="px-3 py-2 text-xs rounded-md bg-[color:var(--brand)] text-white">{uploading ? "Uploading…" : (s.home_announcement_image_url ? "Replace image" : "Upload image")}</button>
              {s.home_announcement_image_url && (
                <button type="button" onClick={() => setS({ ...s, home_announcement_image_url: "" })}
                  className="px-3 py-2 text-xs rounded-md bg-[color:var(--error-soft)] text-[color:var(--error)] inline-flex items-center gap-1">
                  <X className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card-soft p-6">
          <div className="flex items-center justify-between">
            <div className="text-label">Welcome modal</div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={s.welcome_modal_active !== false}
                onChange={(e) => setS({ ...s, welcome_modal_active: e.target.checked })}
                data-testid="welcome-active" />
              <span className="text-[color:var(--text-secondary)]">Show modal</span>
            </label>
          </div>
          <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Heading</label>
          <input type="text" value={s.welcome_modal_title || ""}
            onChange={(e) => setS({ ...s, welcome_modal_title: e.target.value })}
            placeholder="Hi {name} — welcome to NaijaInvest"
            data-testid="welcome-title" className="w-full mt-2 input-base" />
          <label className="block mt-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Message</label>
          <textarea rows={4} value={s.welcome_message || ""}
            onChange={(e) => setS({ ...s, welcome_message: e.target.value })}
            data-testid="welcome-text" className="w-full mt-2 input-base resize-none" />
          <label className="block mt-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Telegram URL</label>
          <input type="url" value={s.telegram_url || ""}
            onChange={(e) => setS({ ...s, telegram_url: e.target.value })}
            placeholder="https://t.me/your-group"
            data-testid="telegram-url" className="w-full mt-2 input-base" />
        </div>

        <button data-testid="ann-save" className="btn-primary inline-flex items-center gap-2"><Save className="w-4 h-4" /> Save</button>
      </form>
    </AdminLayout>
  );
}
