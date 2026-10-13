import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { StaffRole } from '../../shared/types';
import { supabase } from './supabase';

export interface RoleState {
  session: Session | null;
  userId: string | null;
  role: StaffRole | null;
  memberId: string | null;
  loading: boolean;
  error: string | null;
}

const IDLE: RoleState = {
  session: null,
  userId: null,
  role: null,
  memberId: null,
  loading: true,
  error: null,
};

export function useRole(): RoleState {
  const [state, setState] = useState<RoleState>(IDLE);

  useEffect(() => {
    let live = true;

    async function load(session: Session | null) {
      if (!session?.user) {
        if (live) setState({ ...IDLE, loading: false });
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('role, member_id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!live) return;
      if (error) {
        setState({
          session,
          userId: session.user.id,
          role: null,
          memberId: null,
          loading: false,
          error: error.message,
        });
        return;
      }
      const row = data as { role: StaffRole; member_id: string | null } | null;
      setState({
        session,
        userId: session.user.id,
        role: row?.role ?? null,
        memberId: row?.member_id ?? null,
        loading: false,
        error: null,
      });
    }

    supabase.auth
      .getSession()
      .then(({ data }) => void load(data.session))
      .catch(() => {
        if (live) setState({ ...IDLE, loading: false });
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, loading: true }));
      void load(session);
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function isStaffRole(role: StaffRole | null): boolean {
  return role === 'admin' || role === 'storekeeper';
}

export async function staffSignIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return { error: error ? error.message : null };
}

export async function staffSignOut(): Promise<void> {
  await supabase.auth.signOut();
}
