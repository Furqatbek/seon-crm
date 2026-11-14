"use client";

import {
  Archive,
  Check,
  Clock,
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { LanguageSwitch } from "@/components/shell/language-switch";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";
import { MoneyText } from "@/components/ui/money-text";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPhone } from "@/lib/format";

// Sample records. Names are data, not interface text.
const ROWS = [
  { name: "Aziza Karimova", phone: "+998901234567", group: "English B1", balance: 0, status: "paid" },
  { name: "Timur Rashidov", phone: "+998935550101", group: "Math 9", balance: -350_000, status: "debt" },
  { name: "Dilnoza Yusupova", phone: "+998971112233", group: "IELTS 6.5", balance: -600_000, status: "due" },
  { name: "Bekzod Aliyev", phone: "+998909876543", group: "English B1", balance: 150_000, status: "paid" },
] as const;

const STATUS_TONE = { paid: "success", due: "warning", debt: "danger" } as const;

function Section({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border py-8">
      <h2 className="text-headline text-text">{name}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function Showcase() {
  const t = useTranslations("dev");
  const tCommon = useTranslations("common");
  const [view, setView] = useState<"board" | "list">("board");
  const [mark, setMark] = useState<"present" | "late" | "absent" | "excused">("present");
  const [source, setSource] = useState<string>();

  return (
    <div className="mx-auto max-w-content p-4 sm:p-8">
      <PageHeader
        title={t("title")}
        action={
          <Button variant="primary">
            <Plus aria-hidden />
            {t("newStudent")}
          </Button>
        }
      >
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-secondary"
            aria-hidden
          />
          <Input type="search" className="pl-10" placeholder={tCommon("search")} aria-label={tCommon("search")} />
        </div>
        <SegmentedControl
          aria-label={t("view")}
          value={view}
          onValueChange={setView}
          options={[
            { value: "board", label: t("board") },
            { value: "list", label: t("list") },
          ]}
        />
        <LanguageSwitch />
      </PageHeader>

      <Section name="Button">
        <Row>
          <Button variant="primary">{tCommon("save")}</Button>
          <Button variant="secondary">
            <Download aria-hidden />
            {t("export")}
          </Button>
          <Button variant="ghost">{tCommon("cancel")}</Button>
          <Button variant="destructive">{t("archive")}</Button>
          <Button variant="destructive-fill">{t("archive")}</Button>
          <Button variant="ghost" size="icon" aria-label={t("openMenu")}>
            <MoreHorizontal aria-hidden />
          </Button>
        </Row>
        <Row>
          <Button variant="primary" disabled>
            {tCommon("save")}
          </Button>
          <Button variant="secondary" disabled>
            <Download aria-hidden />
            {t("export")}
          </Button>
          <Button variant="ghost" disabled>
            {tCommon("cancel")}
          </Button>
          <Button variant="destructive" disabled>
            {t("archive")}
          </Button>
          <Button variant="destructive-fill" disabled>
            {t("archive")}
          </Button>
        </Row>
      </Section>

      <Section name="Input · Textarea · Select">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("fullName")} htmlFor="demo-empty">
            <Input id="demo-empty" placeholder="Aziza Karimova" />
          </Field>
          <Field label={t("fullName")} htmlFor="demo-filled">
            <Input id="demo-filled" defaultValue="Timur Rashidov" />
          </Field>
          <Field label={t("fullName")} htmlFor="demo-error" error={t("fullNameError")}>
            <Input id="demo-error" aria-invalid aria-describedby="demo-error-error" />
          </Field>
          <Field label={t("fullName")} htmlFor="demo-disabled">
            <Input id="demo-disabled" defaultValue="Dilnoza Yusupova" disabled />
          </Field>
          <Field label={t("source")} htmlFor="demo-select">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="demo-select">
                <SelectValue placeholder={t("sourcePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">{t("instagram")}</SelectItem>
                <SelectItem value="telegram">{t("telegram")}</SelectItem>
                <SelectItem value="referral">{t("referral")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("source")} htmlFor="demo-select-disabled">
            <Select value="telegram" disabled>
              <SelectTrigger id="demo-select-disabled">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">{t("telegram")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("notes")} htmlFor="demo-notes" className="sm:col-span-2">
            <Textarea id="demo-notes" placeholder={t("notes")} />
          </Field>
        </div>
      </Section>

      <Section name="Checkbox · Switch">
        <Row>
          <span className="flex items-center gap-2">
            <Checkbox id="demo-check-off" />
            <Label htmlFor="demo-check-off">{t("reminders")}</Label>
          </span>
          <span className="flex items-center gap-2">
            <Checkbox id="demo-check-on" defaultChecked />
            <Label htmlFor="demo-check-on">{t("reminders")}</Label>
          </span>
          <span className="flex items-center gap-2">
            <Checkbox id="demo-check-disabled" disabled />
            <Label htmlFor="demo-check-disabled">{t("disabled")}</Label>
          </span>
          <span className="flex items-center gap-2">
            <Checkbox id="demo-check-disabled-on" disabled defaultChecked />
            <Label htmlFor="demo-check-disabled-on">{t("disabled")}</Label>
          </span>
        </Row>
        <Row>
          <span className="flex items-center gap-2">
            <Switch id="demo-switch-off" />
            <Label htmlFor="demo-switch-off">{t("reminders")}</Label>
          </span>
          <span className="flex items-center gap-2">
            <Switch id="demo-switch-on" defaultChecked />
            <Label htmlFor="demo-switch-on">{t("reminders")}</Label>
          </span>
          <span className="flex items-center gap-2">
            <Switch id="demo-switch-disabled" disabled />
            <Label htmlFor="demo-switch-disabled">{t("disabled")}</Label>
          </span>
          <span className="flex items-center gap-2">
            <Switch id="demo-switch-disabled-on" disabled defaultChecked />
            <Label htmlFor="demo-switch-disabled-on">{t("disabled")}</Label>
          </span>
        </Row>
      </Section>

      <Section name="SegmentedControl">
        <Row>
          <SegmentedControl
            aria-label={t("view")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "board", label: t("board") },
              { value: "list", label: t("list") },
            ]}
          />
          <SegmentedControl
            aria-label={t("view")}
            value="list"
            onValueChange={() => {}}
            disabled
            options={[
              { value: "board", label: t("board") },
              { value: "list", label: t("list") },
            ]}
          />
        </Row>
        <div className="max-w-sheet">
          <SegmentedControl
            aria-label={t("attendance")}
            fullWidth
            value={mark}
            onValueChange={setMark}
            options={[
              { value: "present", label: t("present") },
              { value: "late", label: t("late") },
              { value: "absent", label: t("absent") },
              { value: "excused", label: t("excused") },
            ]}
          />
        </div>
      </Section>

      <Section name="Tabs">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
            <TabsTrigger value="ledger">{t("ledger")}</TabsTrigger>
            <TabsTrigger value="attendance">{t("attendance")}</TabsTrigger>
            <TabsTrigger value="messages" disabled>
              {t("messages")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-text-secondary">
            {t("overview")}
          </TabsContent>
          <TabsContent value="ledger" className="text-text-secondary">
            {t("ledger")}
          </TabsContent>
          <TabsContent value="attendance" className="text-text-secondary">
            {t("attendance")}
          </TabsContent>
        </Tabs>
      </Section>

      <Section name="Table · Avatar · MoneyText">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("student")}</TableHead>
              <TableHead>{t("group")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead numeric>{t("balance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row, index) => (
              <TableRow key={row.name} selected={index === 1} onClick={() => {}}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={row.name} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{row.name}</span>
                      <span className="text-footnote whitespace-nowrap text-text-secondary numeric">
                        {formatPhone(row.phone)}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge>{row.group}</Badge>
                </TableCell>
                <TableCell>
                  <StatusPill tone={STATUS_TONE[row.status]}>{t(row.status)}</StatusPill>
                </TableCell>
                <TableCell numeric>
                  <MoneyText amount={row.balance} debt />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section name="Badge · StatusPill">
        <Row>
          <Badge>English B1</Badge>
          <Badge tone="purple">{t("active")}</Badge>
          <StatusPill tone="success" icon={Check}>
            {t("paid")}
          </StatusPill>
          <StatusPill tone="warning" icon={Clock}>
            {t("due")}
          </StatusPill>
          <StatusPill tone="danger">{t("debt")}</StatusPill>
          <StatusPill tone="success">{t("present")}</StatusPill>
          <StatusPill tone="warning">{t("late")}</StatusPill>
          <StatusPill tone="danger" icon={X}>
            {t("absent")}
          </StatusPill>
          <StatusPill>{t("excused")}</StatusPill>
        </Row>
      </Section>

      <Section name="KpiCard">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label={t("collected")}>
            <MoneyText amount={48_750_000} />
          </KpiCard>
          <KpiCard label={t("activeStudents")}>128</KpiCard>
          <KpiCard label={t("totalDebt")}>
            <MoneyText amount={-3_950_000} debt />
          </KpiCard>
          <KpiCard label={t("attendanceRate")}>92%</KpiCard>
        </div>
      </Section>

      <Section name="EmptyState">
        <EmptyState icon={Users} action={<Button>{t("clearFilters")}</Button>}>
          {t("noMatches")}
        </EmptyState>
      </Section>

      <Section name="Tooltip · DropdownMenu · Sheet · Dialog · Toast">
        <Row>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("telegramLinked")}>
                <Send aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("telegramLinked")}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>{t("openMenu")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>
                <Pencil aria-hidden />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Download aria-hidden />
                {t("export")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Archive aria-hidden />
                {t("archive")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet>
            <SheetTrigger asChild>
              <Button>{t("openSheet")}</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{t("newStudent")}</SheetTitle>
                <SheetDescription>{t("noMatches")}</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <Field label={t("fullName")} htmlFor="sheet-name">
                  <Input id="sheet-name" placeholder="Aziza Karimova" />
                </Field>
                <Field label={t("notes")} htmlFor="sheet-notes">
                  <Textarea id="sheet-notes" />
                </Field>
              </SheetBody>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="secondary">{tCommon("cancel")}</Button>
                </SheetClose>
                <Button variant="primary">{tCommon("save")}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">{t("openDialog")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("archiveTitle")}</DialogTitle>
                <DialogDescription>{t("archiveBody")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">{tCommon("cancel")}</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive-fill">{t("archive")}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button onClick={() => toast(t("paymentSaved"))}>{t("showToast")}</Button>
        </Row>
      </Section>
    </div>
  );
}
