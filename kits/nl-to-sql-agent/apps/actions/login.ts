'use server';

import { setSession } from '@/lib/session';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  // Demo credentials - in a real app, you would check against a database or use a proper auth system.
  const demoUsername = process.env.DEMO_USERNAME || 'demo';
  const demoPassword = process.env.DEMO_PASSWORD || 'demo';

  if (username === demoUsername && password === demoPassword) {
    // Set the session
    await setSession({ userId: username, isLoggedIn: true });

    // Redirect to the home page
    redirect('/');
  } else {
    // Redirect back to the login page with an error
    redirect('/login?error=1');
  }
}