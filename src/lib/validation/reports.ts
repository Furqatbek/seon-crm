import { z } from "zod";

import { REPORT_PERIODS } from "@/lib/domain/report-period";

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .optional()
  .catch(undefined);

/** URL state of /reports. */
export const reportsSearchSchema = z.object({
  period: z.enum(REPORT_PERIODS).catch("this"),
  from: month,
  to: month,
});
