import { z, ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';

export const registrationSchema = z.object({
  telegram_id: z.number().int(),
  username: z.string().optional(),
  first_name: z.string(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

export const updateUserSchema = z.object({
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
});

export function validateData(schema: z.ZodObject<any, any>, data: any) {
  try {
    return { success: true, data: schema.parse(data) };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: fromZodError(error).toString() };
    }
    return { success: false, error: 'An unknown validation error occurred' };
  }
}

/**
 * Извлекает имя пользователя канала из URL
 * @param url - URL канала (например, https://t.me/durov или t.me/durov или @durov)
 * @returns Имя пользователя канала или null, если URL некорректен
 */
export function parseTelegramChannelUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  try {
    // 1. Попытка обработать как полный URL
    if (url.startsWith('http')) {
      const urlObject = new URL(url);
      const pathname = urlObject.pathname;
      const match = pathname.match(/^\/([a-zA-Z0-9_]{5,})$/);
      if (match) {
        return match[1];
      }
    }

    // 2. Попытка обработать как короткую ссылку t.me/
    let match = url.match(/^(?:t\.me\/|@)([a-zA-Z0-9_]{5,})$/);
    if (match) {
      return match[1];
    }

    // 3. Попытка обработать как просто имя пользователя
    match = url.match(/^([a-zA-Z0-9_]{5,})$/);
    if (match) {
      return match[1];
    }

    return null;
  } catch (error) {
    // Если new URL() выдает ошибку, значит это невалидный URL
    return null;
  }
}
