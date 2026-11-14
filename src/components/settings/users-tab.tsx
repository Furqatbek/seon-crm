"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserRole } from "@/lib/auth";
import { inviteUser, setUserActive, setUserRole } from "@/lib/settings/actions";
import type { UserRow } from "@/lib/settings/queries";
import {
  ROLES,
  TEMPLATE_LANGUAGES,
  inviteSchema,
  type InviteInput,
  type SettingsErrorKey,
  type SettingsResult,
} from "@/lib/validation/settings";

import { Problem } from "./parts";

type Failure = Extract<SettingsResult, { ok: false }>;
const TONE = { active: "success", invited: "warning", deactivated: "neutral" } as const;

function InviteForm({ language, onClose }: { language: InviteInput["language"]; onClose: () => void }) {
  const t = useTranslations("settings");
  const tRoles = useTranslations("userMenu.roles");
  const tLanguage = useTranslations("language");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", full_name: "", role: "manager", language },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as SettingsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      const result = await inviteUser(values);
      if (!result.ok) return setFailure(result);
      toast(t("users.invited", { email: values.email }));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("users.email")} htmlFor="invite-email" error={message(errors.email?.message)}>
          <Input id="invite-email" type="email" autoComplete="off" autoFocus aria-invalid={errors.email ? true : undefined} {...register("email")} />
        </Field>
        <Field label={t("users.name")} htmlFor="invite-name" error={message(errors.full_name?.message)}>
          <Input id="invite-name" autoComplete="off" aria-invalid={errors.full_name ? true : undefined} {...register("full_name")} />
        </Field>
        <Field label={t("users.role")} htmlFor="invite-role">
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="invite-role">
                  <SelectValue>{tRoles(field.value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {tRoles(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label={t("users.language")} htmlFor="invite-language">
          <Controller
            control={control}
            name="language"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="invite-language">
                  <SelectValue>{tLanguage(field.value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_LANGUAGES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {tLanguage(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Problem failure={failure} />
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("users.sendInvite")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Owner only: invite by email, change a role, deactivate or reactivate. */
export function UsersTab({ users, language }: { users: UserRow[]; language: InviteInput["language"] }) {
  const t = useTranslations("settings");
  const tRoles = useTranslations("userMenu.roles");
  const tCommon = useTranslations("common");
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<UserRow | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, startTransition] = useTransition();

  function changeRole(user: UserRow, role: UserRole) {
    setFailure(null);
    startTransition(async () => {
      const result = await setUserRole({ user_id: user.id, role });
      if (!result.ok) setFailure(result);
      else toast(t("users.roleChanged", { name: user.fullName, role: tRoles(role) }));
    });
  }

  function setActive(user: UserRow, active: boolean) {
    setFailure(null);
    setDeactivating(null);
    startTransition(async () => {
      const result = await setUserActive({ user_id: user.id, active });
      if (!result.ok) setFailure(result);
      else toast(t(active ? "users.reactivated" : "users.deactivated", { name: user.fullName }));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Problem failure={failure} />
        <Button variant="primary" onClick={() => setInviting(true)} className="ml-auto w-full sm:w-auto">
          <UserPlus aria-hidden />
          {t("users.invite")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("users.name")}</TableHead>
            <TableHead>{t("users.email")}</TableHead>
            <TableHead>{t("users.role")}</TableHead>
            <TableHead>{t("users.statusColumn")}</TableHead>
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} data-user-row={user.email} data-user-status={user.status}>
              <TableCell className="font-medium whitespace-nowrap">
                {user.fullName}
                {user.isSelf ? <span className="font-normal text-text-secondary"> ({t("users.you")})</span> : null}
              </TableCell>
              <TableCell className="whitespace-nowrap text-text-secondary">{user.email || "—"}</TableCell>
              <TableCell>
                {/* Your own role is not yours to change. */}
                {user.isSelf || user.status === "deactivated" ? (
                  tRoles(user.role)
                ) : (
                  <Select value={user.role} onValueChange={(role) => changeRole(user, role as UserRole)} disabled={busy}>
                    <SelectTrigger aria-label={t("users.roleFor", { name: user.fullName })} className="w-36">
                      <SelectValue>{tRoles(user.role)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {tRoles(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </TableCell>
              <TableCell>
                <StatusPill tone={TONE[user.status]}>{t(`users.status.${user.status}`)}</StatusPill>
              </TableCell>
              <TableCell>
                {user.isSelf ? null : user.status === "deactivated" ? (
                  <Button onClick={() => setActive(user, true)} disabled={busy}>
                    {t("users.reactivate")}
                  </Button>
                ) : (
                  <Button variant="destructive" onClick={() => setDeactivating(user)} disabled={busy}>
                    {t("users.deactivate")}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={inviting} onOpenChange={(next) => !next && setInviting(false)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("users.inviteTitle")}</SheetTitle>
            <SheetDescription>{t("users.inviteHint")}</SheetDescription>
          </SheetHeader>
          {inviting ? <InviteForm language={language} onClose={() => setInviting(false)} /> : null}
        </SheetContent>
      </Sheet>

      <Dialog open={deactivating !== null} onOpenChange={(next) => !next && setDeactivating(null)}>
        <DialogContent>
          {deactivating ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("users.deactivateTitle", { name: deactivating.fullName })}</DialogTitle>
                <DialogDescription>{t("users.deactivateBody")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDeactivating(null)}>
                  {tCommon("cancel")}
                </Button>
                <Button variant="destructive-fill" onClick={() => setActive(deactivating, false)}>
                  {t("users.deactivate")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
