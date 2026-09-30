import { redirect } from 'next/navigation'

/** The menu's Settings item opens the first section. */
export default function SettingsPage() {
  redirect('/settings/profile')
}
