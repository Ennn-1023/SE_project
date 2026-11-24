import { z } from 'zod';
import { fieldError, msg } from '../middleware/validate.js';

const GROUP_HINT = '請從可選的組別中選擇一組';

/** POST /api/groups/me：組別編號為正整數；上限於服務層依 data-model.md `group_settings.group_count` 檢查。 */
export const selfSelectBody = z.object({
  groupNumber: z
    .number(fieldError(msg('請選擇組別', GROUP_HINT), msg('組別編號必須是整數', GROUP_HINT)))
    .int(msg('組別編號必須是整數', GROUP_HINT))
    .min(1, msg('組別編號必須大於等於 1', GROUP_HINT)),
});

const COUNT_HINT = '組數須為 0–50 的整數';

/** PUT /api/groups/settings（data-model.md `group_settings.group_count`：0–50 整數）。 */
export const setGroupCountBody = z.object({
  groupCount: z
    .number(fieldError(msg('請輸入組數', COUNT_HINT), msg('組數必須是整數', COUNT_HINT)))
    .int(msg('組數必須是整數', COUNT_HINT))
    .min(0, msg('組數不可小於 0', COUNT_HINT))
    .max(50, msg('組數不可超過 50', COUNT_HINT)),
});

/** PUT /api/groups/assignments/{studentId}（data-model.md `users.group_number`：正整數或 null = 未分配）。 */
export const assignBody = z.object({
  groupNumber: z
    .number(
      fieldError(
        msg('請選擇組別或「未分配」', '組別編號須為正整數，或以 null 表示未分配'),
        msg('組別編號必須是整數', '組別編號須為正整數，或以 null 表示未分配'),
      ),
    )
    .int(msg('組別編號必須是整數', GROUP_HINT))
    .min(1, msg('組別編號必須大於等於 1', GROUP_HINT))
    .nullable(),
});
