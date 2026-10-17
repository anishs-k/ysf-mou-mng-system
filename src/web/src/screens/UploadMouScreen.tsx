/**
 * Purpose: The Upload MoU screen - the zone -> company -> plant cascade plus scheme,
 * a drag-and-drop / browse zone for one PDF or Excel file, and the simulated
 * upload -> save -> success sequence of the prototype (timed progress bars, no
 * server). Save is enabled as soon as a file has finished "uploading".
 */

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useNavigate } from "react-router-dom";

import { SCHEMES } from "../data/addCompanyOptions.ts";
import { ZONE_COMPANIES } from "../data/companies.ts";
import { MOUS, ZONE_NAMES } from "../data/mous.ts";
import { Field, TextInput } from "../ui/form.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Button, Card, SectionTitle } from "../ui/primitives.tsx";

const ALL_COMPANIES: readonly string[] = Object.values(ZONE_COMPANIES).flat();
const ALL_PLANTS: readonly string[] = MOUS.map((mou) => mou.plant);

/** Before a company is chosen every MoU row's plant is offered; afterwards only that company's rows (any zone). */
function plantsOf(company: string): readonly string[] {
  return company === "" ? ALL_PLANTS : MOUS.filter((mou) => mou.company === company).map((mou) => mou.plant);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CascadeSelectProps {
  readonly options: readonly string[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** The prototype's select; options may repeat or be blank, so they are keyed by position. */
function CascadeSelect({ options, value, onChange }: CascadeSelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
        className="w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Select…</option>
        {options.map((option, index) => (
          <option key={index}>{option}</option>
        ))}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
        <Icon name="chevronDown" className="w-4 h-4" strokeWidth={2} />
      </span>
    </div>
  );
}

interface PickedFile {
  readonly name: string;
  readonly size: number;
}

type Phase = "idle" | "uploading" | "uploaded" | "saving" | "saved";

/** Document Details, shown once the file is uploaded; the prototype saves without validating them. */
interface DocumentDetails {
  readonly date: string;
  readonly validUntil: string;
  readonly reference: string;
}

const NO_DETAILS: DocumentDetails = { date: "", validUntil: "", reference: "" };

export function UploadMouScreen() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [zone, setZone] = useState("");
  const [company, setCompany] = useState("");
  const [plant, setPlant] = useState("");
  const [scheme, setScheme] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [savedFile, setSavedFile] = useState<PickedFile | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [details, setDetails] = useState(NO_DETAILS);

  // Upload and save are simulated: progress climbs in steps, then the phase advances.
  useEffect(() => {
    if (phase !== "uploading" && phase !== "saving") return undefined;
    if (progress === 100) {
      const done = window.setTimeout(() => setPhase(phase === "uploading" ? "uploaded" : "saved"), 200);
      return () => window.clearTimeout(done);
    }
    const tick = window.setTimeout(() => setProgress((current) => Math.min(100, current + (phase === "uploading" ? 9 : 14))), 100);
    return () => window.clearTimeout(tick);
  }, [phase, progress]);

  const pick = (picked: File | undefined) => {
    if (picked === undefined) return;
    setFile({ name: picked.name, size: picked.size });
    setProgress(0);
    setPhase("uploading");
  };

  const removeFile = () => {
    setFile(null);
    setPhase("idle");
    if (inputRef.current !== null) inputRef.current.value = "";
  };

  const save = () => {
    setSavedFile(file);
    setDetails(NO_DETAILS);
    removeFile();
    setProgress(0);
    setPhase("saving");
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  };

  return (
    <ScreenFrame
      title="Upload MoU PDF"
      subtitle="Attach signed MoU documents to company records"
      contentClassName="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5"
    >
      <Card className="p-6">
        <SectionTitle>Select Company</SectionTitle>
        <div className="grid gap-4">
          <Field label="Zone" required>
            <CascadeSelect
              options={ZONE_NAMES}
              value={zone}
              onChange={(value) => {
                setZone(value);
                setCompany("");
                setPlant("");
              }}
            />
          </Field>
          <Field label="Company" required>
            <CascadeSelect
              options={zone === "" ? ALL_COMPANIES : (ZONE_COMPANIES[zone] ?? [])}
              value={company}
              onChange={(value) => {
                setCompany(value);
                setPlant("");
              }}
            />
          </Field>
          <Field label="Plant" required>
            <CascadeSelect options={plantsOf(company)} value={plant} onChange={setPlant} />
          </Field>
          <Field label="Scheme" required>
            <CascadeSelect options={SCHEMES} value={scheme} onChange={setScheme} />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Upload Document</SectionTitle>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xls,.xlsx"
          className="hidden"
          onChange={(event: ChangeEvent<HTMLInputElement>) => pick(event.target.files?.[0])}
        />
        {file === null ? (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragging ? "border-[#1B5FAE] bg-[#E8F0FB]" : "border-border hover:border-[#1B5FAE] hover:bg-muted/40"
            }`}
          >
            <div className="mb-4 text-[#1B5FAE]">
              <Icon name="uploadBox" className="w-12 h-12 mx-auto" strokeWidth={1.5} />
            </div>
            <p className="text-base font-bold text-foreground">Drop file here or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">PDF or Excel · Max 10 MB</p>
            <div className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold bg-[#E8F0FB] text-[#1B5FAE]">Browse Files</div>
          </div>
        ) : phase === "uploading" ? (
          <div className="rounded-xl border border-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#E8F0FB] flex items-center justify-center text-[#1B5FAE] shrink-0">
                <Icon name="upload" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Uploading… {progress}%</p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-[#1B5FAE] transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border p-4 bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                <Icon name="file" className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-900 truncate">{file.name}</p>
                <p className="text-xs text-green-700 mt-0.5">{formatSize(file.size)} · Uploaded successfully</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-green-600">
                  <Icon name="check" className="w-4 h-4" strokeWidth={2.5} />
                </span>
                <button type="button" onClick={removeFile} className="text-muted-foreground hover:text-red-500 transition-colors">
                  <Icon name="close" className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-green-200 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full w-full" />
            </div>
          </div>
        )}
      </Card>

      {phase === "uploaded" && (
        <Card className="p-6">
          <SectionTitle>Document Details</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Document Date" required>
              <TextInput type="date" value={details.date} onChange={(date) => setDetails({ ...details, date })} />
            </Field>
            <Field label="Valid Until" required>
              <TextInput type="date" value={details.validUntil} onChange={(validUntil) => setDetails({ ...details, validUntil })} />
            </Field>
            <Field label="Reference Number" className="col-span-2">
              <TextInput
                placeholder="e.g. RIL/HR/MoU/2026/001"
                value={details.reference}
                onChange={(reference) => setDetails({ ...details, reference })}
              />
            </Field>
          </div>
        </Card>
      )}

      {phase === "saving" && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-[#E8F0FB] flex items-center justify-center text-[#1B5FAE] shrink-0 animate-pulse">
              <Icon name="upload" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Saving to server…</p>
              <p className="text-xs text-muted-foreground mt-0.5">{progress}% complete</p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-[#F26522] transition-all duration-150" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      )}

      {phase === "saved" && savedFile !== null && (
        <Card className="p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-4">
            <Icon name="check" className="w-8 h-8" strokeWidth={2.5} />
          </div>
          <h3 className="font-bold text-lg text-[#0D2E5A] mb-1">Document Saved Successfully</h3>
          <p className="text-sm text-muted-foreground mb-1">{savedFile.name}</p>
          <p className="text-xs text-muted-foreground mb-5">
            {formatSize(savedFile.size)} · Saved on{" "}
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className="inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100 px-4 py-2 text-sm"
            >
              Upload Another
            </button>
            <Button onClick={() => navigate("/")}>Go to Dashboard</Button>
          </div>
        </Card>
      )}

      {phase !== "saving" && phase !== "saved" && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <Button variant="accent" disabled={phase !== "uploaded"} onClick={save}>
            <Icon name="upload" />
            Save Document
          </Button>
        </div>
      )}
    </ScreenFrame>
  );
}
