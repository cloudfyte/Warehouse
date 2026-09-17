"use client";
import { useState, useEffect } from "react";
import type { CuttingAssignment, Employee, RawClothBatch, ItemType } from "@/app/types";
import { CUTTING_STATUS_LABELS } from "@/app/lib/constants";
import { formatDateShort } from "@/app/lib/formatters";
import { friendlyError } from "@/app/lib/errors";
import { showToast } from "@/app/lib/toast";
import Modal from "@/app/components/atoms/Modal";
import Button from "@/app/components/atoms/Button";
import Input from "@/app/components/atoms/Input";
import Select from "@/app/components/atoms/Select";
import SizeSelect from "@/app/components/atoms/SizeSelect";
import AgeGroupSelect from "@/app/components/atoms/AgeGroupSelect";
import Field from "@/app/components/molecules/Field";
import FormGrid from "@/app/components/molecules/FormGrid";
import ErrorBanner from "@/app/components/molecules/ErrorBanner";
import PageHeader from "@/app/components/molecules/PageHeader";
import FilterBar from "@/app/components/molecules/FilterBar";
import PhotoPicker from "@/app/components/molecules/PhotoPicker";
import Pagination from "@/app/components/atoms/Pagination";
import Cell from "@/app/components/molecules/Cell";
import TotalsBar from "@/app/components/molecules/TotalsBar";
import { nameToColorHex } from "@/app/lib/colorUtils";

interface Props {
  assignments: CuttingAssignment[]; batches: RawClothBatch[]
  cuttingMasters: Employee[]; itemTypes: ItemType[]
  isAdmin: boolean; isSuperAdmin: boolean; isManager: boolean; isCuttingMaster: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMutate: (q: string, v: Record<string, unknown>) => Promise<any>
}

// ── Status step trail ──────────────────────────────────────────────────────────

const PER_PAGE = 20;


const STEP_COLORS: Record<string, string> = {
  PENDING: "#94a3b8", IN_PROGRESS: "#f59e0b", PARTIAL: "#6366f1", COMPLETED: "#10b981",
};

export default function Cutting({ assignments, batches, cuttingMasters, itemTypes, isAdmin, isSuperAdmin, isManager, isCuttingMaster, onMutate }: Props) {
  const [selected, setSelected] = useState<CuttingAssignment | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ batchId: "", masterId: "", itemTypeId: "", meters: "", targetPieces: "", ageGroup: "", size: "", notes: "" });
  // Cloth is cut for a reason, and the reason is decided here rather than
  // three steps later. Readymade carries the customer's bill number onward.
  const [purpose, setPurpose] = useState({
    jobType: "WHOLESALE", bill: "", name: "", phone: "", photos: "",
  });
  /**
   * Extra dockets in the same handout.
   *
   * Three cloths to one master, or one cloth split between two with a share
   * each — both are just more rows, so one screen covers both rather than two.
   * The first docket is the form above; these are the rest.
   */
  const [extra, setExtra] = useState<{ batchId: string; masterId: string; meters: string; pieces: string }[]>([]);
  const [run, setRun] = useState<{ size: string; pieces: string }[]>([]);
  const runRows = run
    .filter(r => r.size.trim() && +r.pieces > 0)
    .map(r => ({ size: r.size.trim(), pieces: +r.pieces }));
  const runTotal = runRows.reduce((t, r) => t + r.pieces, 0);
  const extraRows = extra.filter(r => +r.meters > 0 && +r.pieces > 0);
  const [update, setUpdate] = useState({ piecesCompleted: 0, clothUsed: 0, clothWasted: 0, status: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [localItemTypes, setLocalItemTypes] = useState<ItemType[]>(itemTypes);
  const [newItemTypeName, setNewItemTypeName] = useState("");
  const [addingItemType, setAddingItemType] = useState(false);
  const [itemTypeCreating, setItemTypeCreating] = useState(false);

  const [localMasters, setLocalMasters] = useState<Employee[]>(cuttingMasters);
  const [newMasterName, setNewMasterName] = useState("");
  const [newMasterPass, setNewMasterPass] = useState("");
  const [addingMaster, setAddingMaster] = useState(false);
  const [masterCreating, setMasterCreating] = useState(false);

  async function createItemTypeInline() {
    if (!newItemTypeName.trim()) return;
    setItemTypeCreating(true);
    try {
      const r = await onMutate(
        `mutation C($n:String!){createItemType(name:$n,category:"OTHER",clothLengthPerPiece:1.0){itemType{id name}}}`,
        { n: newItemTypeName.trim() }
      );
      const created = r?.createItemType?.itemType;
      if (created) {
        setLocalItemTypes(p => [...p, created]);
        setForm(p => ({ ...p, itemTypeId: created.id }));
        setNewItemTypeName(""); setAddingItemType(false);
      }
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setItemTypeCreating(false); }
  }

  async function createMasterInline() {
    if (!newMasterName.trim() || !newMasterPass.trim()) return;
    setMasterCreating(true);
    try {
      const r = await onMutate(
        `mutation C($u:String!,$p:String!){createEmployee(username:$u,password:$p,role:"CUTTING_MASTER"){employee{id username}}}`,
        { u: newMasterName.trim(), p: newMasterPass.trim() }
      );
      const created = r?.createEmployee?.employee;
      if (created) {
        setLocalMasters(p => [...p, created]);
        setForm(p => ({ ...p, masterId: created.id }));
        setNewMasterName(""); setNewMasterPass(""); setAddingMaster(false);
      }
    } catch (e: unknown) { setError(friendlyError(e)); }
    finally { setMasterCreating(false); }
  }
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const canAssign = isSuperAdmin || isAdmin || isManager;
  const canUpdate = canAssign || isCuttingMaster;
  const q = search.toLowerCase();
  const filtered = assignments.filter(a =>
    (!statusFilter || a.status === statusFilter) &&
    (!q || a.cuttingMaster.username.toLowerCase().includes(q) ||
      a.rawClothBatch.batchNumber.toLowerCase().includes(q) ||
      a.rawClothBatch.clothCategory.name.toLowerCase().includes(q) ||
      a.itemType.name.toLowerCase().includes(q))
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  // The numbers follow the filter — a total for a screen you are not looking
  // at answers nobody's question.
  const totals = filtered.reduce((t, a) => ({
    cut: t.cut + (Number(a.piecesCompleted) || 0),
    target: t.target + (Number(a.targetPieces) || 0),
    cloth: t.cloth + (Number(a.clothUsed) || 0),
    waste: t.waste + (Number(a.clothWasted) || 0),
  }), { cut: 0, target: 0, cloth: 0, waste: 0 });

  async function createAssignment() {
    setLoading(true); setError("");
    try {
      // One docket or several — the same call either way. Extra rows repeat
      // whichever column changes: another cloth for the same master, or the
      // same cloth shared between masters.
      const lines = [
        {
          rawClothBatchId: form.batchId, cuttingMasterId: form.masterId,
          itemTypeId: form.itemTypeId, metersAssigned: +form.meters,
          targetPieces: runTotal > 0 ? undefined : +form.targetPieces,
          sizes: runRows.length ? runRows : undefined,
          ageGroup: form.ageGroup || undefined, size: form.size || undefined,
        },
        ...extraRows.map(r => ({
          rawClothBatchId: r.batchId || form.batchId,
          cuttingMasterId: r.masterId || form.masterId,
          itemTypeId: form.itemTypeId,
          metersAssigned: +r.meters,
          targetPieces: +r.pieces,
        })),
      ];

      await onMutate(
        `mutation C($lines:[CuttingLineInput!]!,$kind:String,$bill:String,$notes:String,$cname:String,$cphone:String,$cphotos:String){`
        + `createCuttingAssignments(lines:$lines,jobType:$kind,customerBillNumber:$bill,notes:$notes,`
        + `customerName:$cname,customerPhone:$cphone,billPhotos:$cphotos)`
        + `{assignments{id}}}`,
        {
          lines,
          kind: purpose.jobType,
          bill: purpose.jobType === "READYMADE" ? purpose.bill.trim() : undefined,
          cname: purpose.jobType === "READYMADE" ? purpose.name.trim() : undefined,
          cphone: purpose.jobType === "READYMADE" ? purpose.phone.trim() : undefined,
          cphotos: purpose.jobType === "READYMADE" ? purpose.photos : undefined,
          notes: form.notes,
        }
      );
      setShowForm(false);
      setForm({ batchId: "", masterId: "", itemTypeId: "", meters: "", targetPieces: "", ageGroup: "", size: "", notes: "" });
      setRun([]); setPurpose({ jobType: "WHOLESALE", bill: "", name: "", phone: "", photos: "" }); setExtra([]);
      showToast(extraRows.length
        ? `${extraRows.length + 1} dockets handed out.`
        : "Cutting assignment created.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  async function saveUpdate() {
    if (!selected) return;
    setLoading(true); setError("");
    const pc = Number(update.piecesCompleted);
    const cu = Number(update.clothUsed);
    const cw = Number(update.clothWasted);
    if (pc > selected.targetPieces) {
      setError(`Pieces completed (${pc}) cannot exceed target pieces (${selected.targetPieces}).`);
      showToast(`Cannot exceed ${selected.targetPieces} target pieces.`, "error");
      setLoading(false); return;
    }
    if (cu > Number(selected.metersAssigned)) {
      setError(`Cloth used (${cu}m) cannot exceed meters assigned (${selected.metersAssigned}m).`);
      showToast(`Cannot exceed ${selected.metersAssigned}m assigned cloth.`, "error");
      setLoading(false); return;
    }
    try {
      await onMutate(
        `mutation U($id:ID!,$status:String,$pc:Int,$cu:Float,$cw:Float){updateCuttingAssignment(id:$id,status:$status,piecesCompleted:$pc,clothUsed:$cu,clothWasted:$cw){assignment{id status piecesCompleted}}}`,
        { id: selected.id, status: update.status || undefined, pc: Number.isFinite(pc) ? pc : undefined, cu: Number.isFinite(cu) ? cu : undefined, cw: Number.isFinite(cw) ? cw : undefined }
      );
      setSelected(null);
      showToast("Cutting assignment updated.", "success");
    } catch (e: unknown) { setError(friendlyError(e)); showToast(friendlyError(e), "error"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Cutting"
        sub="What each master has on the table, and how far it has got"
        actions={canAssign && <Button onClick={() => { setShowForm(true); setError(""); }}>+ New Assignment</Button>}
      />

      <TotalsBar
        narrowed={filtered.length !== assignments.length}
        note="Totals are for what you have filtered, not every docket."
        totals={[
          { label: "Dockets", value: String(filtered.length) },
          { label: "Pieces cut", value: `${totals.cut} of ${totals.target}`, color: "var(--primary)" },
          { label: "Cloth issued", value: `${totals.cloth.toFixed(1)}m` },
          { label: "Waste", value: `${totals.waste.toFixed(1)}m`, color: totals.waste > 0 ? "#e65100" : undefined },
        ]}
      />

      <FilterBar style={{ marginBottom: 20 }}>
        <Input placeholder="Search master, cloth or item…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: "auto", minWidth: 180 }}>
          <option value="">All statuses</option>
          {Object.entries(CUTTING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </FilterBar>

      {/* New Assignment modal */}
      {showForm && (
        <Modal title="New Cutting Assignment" subtitle="Assign cloth from a batch to a cutting master"
          onClose={() => { setShowForm(false); setError(""); setForm({ batchId: "", masterId: "", itemTypeId: "", meters: "", targetPieces: "", ageGroup: "", size: "", notes: "" }); }} width={520}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button onClick={createAssignment} disabled={loading || !form.batchId || !form.masterId || !form.itemTypeId || !form.meters || (runTotal === 0 && !form.targetPieces) || (purpose.jobType === "READYMADE" && !purpose.bill.trim())} style={{ flex: 1 }}>{loading ? "Assigning…" : "Create Assignment"}</Button>
            <Button variant="secondary" onClick={() => { setShowForm(false); setError(""); setForm({ batchId: "", masterId: "", itemTypeId: "", meters: "", targetPieces: "", ageGroup: "", size: "", notes: "" }); }} style={{ flex: 1 }}>Cancel</Button>
          </div>}>
          <ErrorBanner msg={error} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Raw Cloth Batch" required>
              <Select value={form.batchId} onChange={e => setForm(p => ({ ...p, batchId: e.target.value }))}>
                <option value="">Select…</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.batchNumber} — {b.clothCategory.name} {b.clothColor.name} ({b.availableMeters}m available)</option>)}
              </Select>
            </Field>

            {/* Cutting Master with inline create */}
            <Field label="Cutting Master" required>
              <Select value={form.masterId} onChange={e => setForm(p => ({ ...p, masterId: e.target.value }))}>
                <option value="">Select…</option>
                {localMasters.map(m => <option key={m.id} value={m.id}>{m.username}</option>)}
              </Select>
              {!addingMaster
                ? <button type="button" onClick={() => setAddingMaster(true)} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontWeight: 600 }}>+ Create new cutting master</button>
                : <div style={{ background: "var(--canvas)", borderRadius: 8, padding: 12, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <Input placeholder="Username" value={newMasterName} onChange={e => setNewMasterName(e.target.value)} />
                    <Input placeholder="Password" type="password" value={newMasterPass} onChange={e => setNewMasterPass(e.target.value)} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button type="button" onClick={createMasterInline} disabled={masterCreating || !newMasterName.trim() || !newMasterPass.trim()} size="sm">{masterCreating ? "Creating…" : "Create"}</Button>
                      <Button type="button" variant="secondary" onClick={() => { setAddingMaster(false); setNewMasterName(""); setNewMasterPass(""); }} size="sm">Cancel</Button>
                    </div>
                  </div>
              }
            </Field>

            {/* Item Type with inline create */}
            <Field label="Item Type" required>
              <Select value={form.itemTypeId} onChange={e => setForm(p => ({ ...p, itemTypeId: e.target.value }))}>
                <option value="">Select…</option>
                {localItemTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              {!addingItemType
                ? <button type="button" onClick={() => setAddingItemType(true)} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontWeight: 600 }}>+ Create new item type</button>
                : <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Input placeholder="Item type name (e.g. Shirt, Kurti…)" value={newItemTypeName} onChange={e => setNewItemTypeName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && createItemTypeInline()} style={{ flex: 1 }} autoFocus />
                    <Button type="button" onClick={createItemTypeInline} disabled={itemTypeCreating || !newItemTypeName.trim()} size="sm">{itemTypeCreating ? "…" : "Create"}</Button>
                    <Button type="button" variant="secondary" onClick={() => { setAddingItemType(false); setNewItemTypeName(""); }} size="sm">✕</Button>
                  </div>
              }
            </Field>

            <FormGrid>
              <Field label="Meters Assigned" required>
                <Input type="number" step="0.01" value={form.meters} placeholder="0.00" onChange={e => setForm(p => ({ ...p, meters: e.target.value }))} />
              </Field>
              <Field label="Target Pieces" required
                hint={runTotal > 0 ? "Comes from the size run below." : "Or list the sizes below."}>
                <Input type="number" value={runTotal > 0 ? String(runTotal) : form.targetPieces}
                  disabled={runTotal > 0} placeholder="0"
                  onChange={e => setForm(p => ({ ...p, targetPieces: e.target.value }))} />
              </Field>
            </FormGrid>

            <Field label="What is this cut for?" required
              hint="Wholesale is made ahead of demand. Readymade is a customer's order, and their bill number follows the pieces to the tag.">
              <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                {([["WHOLESALE", "Wholesale"], ["READYMADE", "Readymade"]] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setPurpose(p => ({ ...p, jobType: key }))}
                    style={{
                      padding: "7px 16px", fontSize: 13, border: "none", cursor: "pointer",
                      fontWeight: purpose.jobType === key ? 700 : 500,
                      background: purpose.jobType === key ? "var(--primary)" : "transparent",
                      color: purpose.jobType === key ? "#fff" : "var(--muted)",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            {purpose.jobType === "READYMADE" && (
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                  The customer&apos;s written bill
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.55 }}>
                  Recorded once, here. It follows the pieces through the karigar and onto the
                  finished garment, so nobody types it again.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Bill number" required>
                    <Input value={purpose.bill} placeholder="e.g. SW-1042"
                      onChange={e => setPurpose(p => ({ ...p, bill: e.target.value }))} />
                  </Field>
                  <Field label="Customer name">
                    <Input value={purpose.name} placeholder="Who ordered it"
                      onChange={e => setPurpose(p => ({ ...p, name: e.target.value }))} />
                  </Field>
                  <Field label="Phone">
                    <Input value={purpose.phone}
                      onChange={e => setPurpose(p => ({ ...p, phone: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Photo of the written bill"
                  hint="The measurements and the customer's own words are on the paper, and none of that survives being retyped.">
                  <PhotoPicker value={purpose.photos}
                    onChange={v => setPurpose(p => ({ ...p, photos: v }))} max={4} />
                </Field>
              </div>
            )}

            {/* A docket is cut as twelve of 38 and twenty of 40, not as a lump
                of thirty-two. Listing the run here is what lets a stitching job
                — and eventually a tag — know which size it is holding. */}
            {/* Another cloth for the same master, or the same cloth shared with
                another — both are just more rows. */}
            <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                Hand out more at once <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.5 }}>
                Leave a box empty to reuse the one above — so you can give the same master another
                cloth, or split this cloth between masters. Nothing is handed out unless every
                row is good.
              </div>
              {extra.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <Select value={r.batchId} style={{ flex: 1 }}
                    onChange={e => setExtra(rs => rs.map((x, j) => j === i ? { ...x, batchId: e.target.value } : x))}>
                    <option value="">Same cloth</option>
                    {batches.map(b => <option key={b.id} value={b.id}>{b.designNumber || b.batchNumber} ({b.availableMeters}m)</option>)}
                  </Select>
                  <Select value={r.masterId} style={{ flex: 1 }}
                    onChange={e => setExtra(rs => rs.map((x, j) => j === i ? { ...x, masterId: e.target.value } : x))}>
                    <option value="">Same master</option>
                    {localMasters.map(m => <option key={m.id} value={m.id}>{m.username}</option>)}
                  </Select>
                  <Input type="number" min="0" step="0.01" placeholder="Metres" value={r.meters} style={{ width: 100 }}
                    onChange={e => setExtra(rs => rs.map((x, j) => j === i ? { ...x, meters: e.target.value } : x))} />
                  <Input type="number" min="1" placeholder="Pieces" value={r.pieces} style={{ width: 95 }}
                    onChange={e => setExtra(rs => rs.map((x, j) => j === i ? { ...x, pieces: e.target.value } : x))} />
                  <button type="button" aria-label={`Remove docket ${i + 2}`}
                    onClick={() => setExtra(rs => rs.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: "var(--muted)", padding: 6, cursor: "pointer" }}>×</button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm"
                onClick={() => setExtra(rs => [...rs, { batchId: "", masterId: "", meters: "", pieces: "" }])}>
                + Another docket
              </Button>
              {extraRows.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                  <strong style={{ color: "var(--ink)" }}>{extraRows.length + 1} dockets</strong> will be handed out together.
                </div>
              )}
            </div>

            <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                Size run <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional, first docket</span>
              </div>
              {run.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <Input placeholder="Size — e.g. 40" value={r.size} style={{ flex: 1 }}
                    onChange={e => setRun(rs => rs.map((x, j) => j === i ? { ...x, size: e.target.value } : x))} />
                  <Input type="number" min="1" placeholder="Pieces" value={r.pieces} style={{ width: 110 }}
                    onChange={e => setRun(rs => rs.map((x, j) => j === i ? { ...x, pieces: e.target.value } : x))} />
                  <button type="button" aria-label={`Remove size ${i + 1}`}
                    onClick={() => setRun(rs => rs.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: "var(--muted)", padding: 6, cursor: "pointer" }}>×</button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm"
                onClick={() => setRun(rs => [...rs, { size: "", pieces: "" }])}>
                + Add size
              </Button>
              {runTotal > 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                  {run.filter(r => r.size.trim() && +r.pieces > 0).length} sizes ·{" "}
                  <strong style={{ color: "var(--ink)" }}>{runTotal} pieces</strong> in total.
                </div>
              )}
            </div>
            <FormGrid cols={3}>
              <Field label="Age Group (optional)">
                <AgeGroupSelect value={form.ageGroup} onChange={v => setForm(p => ({ ...p, ageGroup: v, size: "" })) } />
              </Field>
              <div>
                <SizeSelect value={form.size} onChange={v => setForm(p => ({ ...p, size: v }))} label="Size (optional)" ageGroup={form.ageGroup || undefined} />
              </div>
              <Field label="Notes">
                <Input value={form.notes} placeholder="Optional notes…" onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </Field>
            </FormGrid>
          </div>
        </Modal>
      )}

      {/* Update modal */}
      {selected && (
        <Modal title={`Update: ${selected.assignmentNumber}`}
          subtitle={`${selected.itemType.name} · ${selected.metersAssigned}m · ${selected.targetPieces} target pieces`}
          onClose={() => { setSelected(null); setError(""); }} width={460}
          footer={<div style={{ display: "flex", gap: 10 }}>
            <Button onClick={saveUpdate} disabled={loading} style={{ flex: 1 }}>{loading ? "Saving…" : "Save Update"}</Button>
            <Button variant="secondary" onClick={() => { setSelected(null); setError(""); }} style={{ flex: 1 }}>Cancel</Button>
          </div>}>
          {selected.status === "COMPLETED" && (
            <div style={{ padding: "10px 12px", borderRadius: 9, background: "#0ea5e918", fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
              This docket is already finished, and can still be corrected \u2014 a miscount turns
              up the next morning often enough. Changing the cloth figures moves the batch by
              the <strong>difference</strong> only, so the leftover never goes back twice.
            </div>
          )}
          <ErrorBanner msg={error} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Status">
              <Select value={update.status || selected.status} onChange={e => setUpdate(p => ({ ...p, status: e.target.value }))}>
                {Object.entries(CUTTING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <FormGrid cols={3}>
              {([["Pieces Done", "piecesCompleted"], ["Cloth Used (m)", "clothUsed"], ["Wasted (m)", "clothWasted"]] as [string, string][]).map(([label, field]) => (
                <Field key={field} label={label}>
                  <Input type="number" step="0.01" value={(update as unknown as Record<string, number>)[field] || 0}
                    onChange={e => setUpdate(p => ({ ...p, [field]: +e.target.value }))} />
                </Field>
              ))}
            </FormGrid>
          </div>
        </Modal>
      )}

      {/* ── Card grid ── */}
      {filtered.length === 0 ? (
        <div style={{ padding: "64px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>No assignments found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {paged.map(a => {
            const swatch = nameToColorHex(a.rawClothBatch.clothColor?.name || "");
            const target = Number(a.targetPieces) || 0;
            const done = Number(a.piecesCompleted) || 0;
            const pct = target > 0 ? Math.max(0, Math.min(100, (done / target) * 100)) : 0;
            const st = STEP_COLORS[a.status] || "#94a3b8";
            return (
              <div key={a.id} style={{
                display: "grid",
                // Minimums sum to ~900 with the gaps — a 1280 laptop with the
                // sidebar open still shows every column without scrolling.
                gridTemplateColumns: "minmax(150px,1.3fr) minmax(110px,1fr) minmax(110px,1fr) minmax(150px,1.2fr) 150px 130px 92px",
                gap: 16, alignItems: "center",
                border: "1px solid var(--line)", borderLeft: `3px solid ${st}`,
                borderRadius: 12, padding: "14px 16px", background: "var(--paper)",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2 }}>
                    {a.rawClothBatch.designNumber || a.rawClothBatch.batchNumber}
                  </div>
                  {a.rawClothBatch.clothColor && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 7, marginTop: 6,
                      padding: "3px 11px 3px 4px", borderRadius: 99,
                      background: "var(--canvas)", border: "1px solid var(--line)", fontSize: 13,
                    }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                        background: swatch ?? "transparent", border: "1px solid rgba(0,0,0,.18)",
                      }} />
                      {a.rawClothBatch.clothColor.name}
                    </span>
                  )}
                </div>

                <Cell label="Making" value={a.itemType.name} />
                <Cell label="Cutting master" value={a.cuttingMaster.username} />

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Sizes
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                    {(a.sizes?.length ?? 0) > 0 ? a.sizes!.map(z => (
                      <span key={z.id} style={{
                        fontSize: 12.5, padding: "2px 8px", borderRadius: 7,
                        border: "1px solid var(--line)", background: "var(--canvas)",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        <strong>{z.size}</strong> {z.piecesCompleted}/{z.targetPieces}
                      </span>
                    )) : <span style={{ fontSize: 14 }}>{a.size || a.ageGroup || "—"}</span>}
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "flex-end" }}>
                    <span style={{
                      fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      color: pct === 100 ? "#2e7d32" : "var(--ink)", letterSpacing: -0.5, lineHeight: 1.1,
                    }}>{done}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>of {target} cut</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: "var(--line)", marginTop: 7, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: pct === 100 ? "#2e7d32" : "var(--primary)" }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5, textAlign: "right" }}>
                    {CUTTING_STATUS_LABELS[a.status] || a.status} · {formatDateShort(a.assignedDate)}
                  </div>
                </div>

                <div>
                  <Cell label="Cloth" align="right"
                    value={`${a.clothUsed || 0}m of ${a.metersAssigned}m`} />
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, textAlign: "right" }}>
                    {a.clothWasted > 0 ? `${a.clothWasted}m waste` : ""}
                    {a.costPerPiece != null && done > 0 ? `${a.clothWasted > 0 ? " · " : ""}₹${a.costPerPiece}/pc` : ""}
                    {a.jobType === "READYMADE" && a.customerBillNumber ? ` · bill ${a.customerBillNumber}` : ""}
                  </div>
                </div>

                {canUpdate ? (
                  <Button size="sm" variant="secondary"
                    onClick={() => { setSelected(a); setUpdate({ piecesCompleted: Number(a.piecesCompleted) || 0, clothUsed: Number(a.clothUsed) || 0, clothWasted: Number(a.clothWasted) || 0, status: a.status }); setError(""); }}>
                    Update
                  </Button>
                ) : <span />}
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}
