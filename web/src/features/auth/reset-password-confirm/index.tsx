/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { PasswordInput } from '@/components/password-input'
import { Turnstile } from '@/components/turnstile'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'

import { confirmPasswordReset } from '../api'
import { resetPasswordConfirmFormSchema } from '../constants'
import { useTurnstile } from '../hooks/use-turnstile'
import { AuthLayout } from '../auth-layout'

export type ResetPasswordSearchParams = {
  email?: string
  token?: string
}

type ResetPasswordConfirmProps = ResetPasswordSearchParams

export function ResetPasswordConfirm({
  email,
  token,
}: ResetPasswordConfirmProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [succeeded, setSucceeded] = useState(false)
  const {
    isTurnstileEnabled,
    turnstileSiteKey,
    turnstileToken,
    setTurnstileToken,
    validateTurnstile,
  } = useTurnstile()

  const form = useForm<z.infer<typeof resetPasswordConfirmFormSchema>>({
    resolver: zodResolver(resetPasswordConfirmFormSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  const isValidResetLink = Boolean(email && token)
  const turnstileReady = !isTurnstileEnabled || Boolean(turnstileToken)

  async function onSubmit(
    data: z.infer<typeof resetPasswordConfirmFormSchema>
  ) {
    if (!isValidResetLink || !email || !token) {
      toast.error(t('Invalid reset link, please request a new password reset'))
      return
    }
    if (!validateTurnstile()) return

    setIsLoading(true)
    try {
      const res = await confirmPasswordReset({
        email,
        token,
        password: data.password,
        turnstile: turnstileToken,
      })
      if (res?.success) {
        setSucceeded(true)
        toast.success(t('Your password has been reset successfully'))
      } else {
        handleServerError(createServerError(res, t('Request failed')))
      }
    } catch (error) {
      handleServerError(AuthOperationError.from(error, t('Request failed')))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className='w-full space-y-8'>
        <div className='space-y-2'>
          <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
            {t('Reset password')}
          </h2>
          <p className='text-muted-foreground text-left text-sm sm:text-base'>
            {succeeded
              ? t('Your password has been reset successfully')
              : t(
                  'Set a new password using the reset link from your email.'
                )}
          </p>
        </div>

        <div className='space-y-4'>
          {!isValidResetLink && (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('Invalid reset link, please request a new password reset.')}
              </AlertDescription>
            </Alert>
          )}

          <div className='space-y-2'>
            <Label htmlFor='email'>{t('Email')}</Label>
            <Input
              id='email'
              type='email'
              value={email || ''}
              disabled
              placeholder={t('Waiting for email...')}
            />
          </div>

          {succeeded ? (
            <Button
              className='w-full'
              onClick={() => navigate({ to: '/sign-in', replace: true })}
            >
              {t('Back to login')}
            </Button>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-4'
              >
                <FormField
                  control={form.control}
                  name='password'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('New password')}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder={t('Enter password (8–128 characters)')}
                          autoComplete='new-password'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='confirmPassword'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Confirm password')}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder={t('Confirm password')}
                          autoComplete='new-password'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isTurnstileEnabled && (
                  <Turnstile
                    siteKey={turnstileSiteKey}
                    onVerify={setTurnstileToken}
                  />
                )}

                <Button
                  type='submit'
                  className='w-full'
                  disabled={
                    isLoading || !isValidResetLink || !turnstileReady
                  }
                >
                  {isLoading ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : null}
                  {t('Confirm new password')}
                </Button>
                <Button
                  type='button'
                  variant='link'
                  className='w-full'
                  onClick={() => navigate({ to: '/sign-in', replace: true })}
                >
                  {t('Back to login')}
                </Button>
              </form>
            </Form>
          )}
        </div>
      </div>
    </AuthLayout>
  )
}
