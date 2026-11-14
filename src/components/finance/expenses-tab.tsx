"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { Pagination } from "@/components/ui/pagination";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addExpense } from "@/lib/finance/actions";
import type { ExpenseRow } from "@/lib/finance/queries";
import { formatDay } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import {
  EXPENSE_CATEGORIES,
  expenseSchema,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseValues,
  type FinanceErrorKey,
} from "@/lib/validation/finance";

const ALL = "all";

function ExpenseForm({ today, onClose }: { today: string; onClose: () => void }) {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<FinanceErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ExpenseInput, unknown, ExpenseValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: undefined, amount: "", spent_on: today, note: "" },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as FinanceErrorKey}`) : null);

  const onSubmit = handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await addExpense(getValues());
      if (!result.ok) return setFormError(result.error);
      toast(t("expenses.done"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("fields.category")} htmlFor="expense-category" error={message(errors.category?.message)}>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger id="expense-category" aria-invalid={errors.category ? true : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {t(`expenses.category.${category}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label={t("expenses.amount")} htmlFor="expense-amount" error={message(errors.amount?.message)}>
          <Input
            id="expense-amount"
            inputMode="numeric"
            autoComplete="off"
            className="numeric"
            aria-invalid={errors.amount ? true : undefined}
            {...register("amount")}
          />
        </Field>
        <Field label={t("fields.date")} htmlFor="expense-date" error={message(errors.spent_on?.message)}>
          <Input
            id="expense-date"
            type="date"
            max={today}
            aria-invalid={errors.spent_on ? true : undefined}
            {...register("spent_on")}
          />
        </Field>
        <Field label={t("fields.note")} htmlFor="expense-note" error={message(errors.note?.message)}>
          <Input id="expense-note" autoComplete="off" {...register("note")} />
        </Field>
        {formError ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${formError}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {t("expenses.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Owner only: the month's expenses, a category filter and Add expense. */
export function ExpensesTab({
  rows,
  total,
  page,
  category,
  today,
}: {
  rows: ExpenseRow[];
  total: number;
  page: number;
  category: ExpenseCategory | undefined;
  today: string;
}) {
  const t = useTranslations("finance");
  const locale = useLocale();
  const { setParams } = useUrlState();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={category ?? ALL}
          onValueChange={(value) => setParams({ category: value === ALL ? null : value, page: null })}
        >
          <SelectTrigger aria-label={t("fields.category")} className="w-full sm:w-48">
            <SelectValue>{category ? t(`expenses.category.${category}`) : t("filters.allCategories")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allCategories")}</SelectItem>
            {EXPENSE_CATEGORIES.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`expenses.category.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setAdding(true)} className="w-full sm:w-auto">
          <Plus aria-hidden />
          {t("expenses.add")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText}>{t("expenses.empty")}</EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.date")}</TableHead>
                <TableHead>{t("fields.category")}</TableHead>
                <TableHead>{t("fields.note")}</TableHead>
                <TableHead numeric>{t("fields.amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-expense-row={row.category}>
                  <TableCell className="whitespace-nowrap numeric">
                    {formatDay(row.spent_on, locale, { year: true })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t(`expenses.category.${row.category}`)}</TableCell>
                  <TableCell className="min-w-48 text-text-secondary">{row.note ?? "—"}</TableCell>
                  <TableCell numeric>
                    <MoneyText amount={row.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            total={total}
            onPageChange={(next) => setParams({ page: next <= 1 ? null : String(next) })}
          />
        </>
      )}

      <Sheet open={adding} onOpenChange={(next) => !next && setAdding(false)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("expenses.title")}</SheetTitle>
          </SheetHeader>
          {adding ? <ExpenseForm today={today} onClose={() => setAdding(false)} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
