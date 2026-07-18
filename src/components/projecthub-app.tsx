"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signInWithEmailAndPassword } from "firebase/auth";
import { z } from "zod";
import {
  AlertCircle, ArrowLeft, ArrowRight, Bell, BriefcaseBusiness, Camera, CheckCircle2, ChevronRight, Download, Eye, ExternalLink, FileText,
  Files, Folder, FolderOpen, HardDrive, ImageIcon, Info, LayoutDashboard, Loader2, LogOut, Menu, MessageCircle,
  Plus, Search, Settings, Sparkles, Trash2, Upload, UserPlus, UserRound, Users, Video,
} from "lucide-react";
import { toast } from "sonner";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { explainClientAuthError } from "@/lib/firebase-errors";
import { formatDate } from "@/lib/dates";
import { roleLabel } from "@/lib/roles";
import type { AppUser, Project, ProjectFile, Role } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessagesContent, NetworkContent } from "@/components/social-pages";

const loginSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
});

const signupSchema = z.object({
  firstname: z.string().min(2, "Prénom requis"),
  lastname: z.string().min(2, "Nom requis"),
  email: z.string().email("Adresse email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
  passwordConfirm: z.string().min(6, "6 caractères minimum"),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Les mots de passe ne correspondent pas",
  path: ["passwordConfirm"],
});

const projectSchema = z.object({
  title: z.string().min(2, "Le nom est requis"),
  description: z.string().max(500),
  category: z.string(),
  client: z.string(),
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;
type ProjectValues = z.infer<typeof projectSchema>;

async function getMe(): Promise<AppUser> {
  const response = await fetch("/api/me", { cache: "no-store" });
  if (response.status === 401 || response.status === 404) {
    throw new Error("SESSION_EXPIRED");
  }
  if (!response.ok) throw new Error("Impossible de charger le profil");
  return response.json();
}

async function getProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects", { cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de charger les projets");
  return response.json();
}

async function getUsers(): Promise<AppUser[]> {
  const response = await fetch("/api/users", { cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de charger les utilisateurs");
  return response.json();
}

async function logout() {
  await fetch("/api/session", { method: "DELETE" });
}

async function createServerSession(idToken: string) {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = { error: raw.slice(0, 200) || `HTTP ${response.status}` };
  }
  return { ok: response.ok, status: response.status, body };
}

function initials(user: Pick<AppUser, "firstname" | "lastname">) {
  return `${user.firstname[0] ?? ""}${user.lastname[0] ?? ""}`.toUpperCase() || "?";
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} Ko`;
  return `${(bytes / 1_000_000).toFixed(1)} Mo`;
}

function UserAvatar({
  user,
  className,
  fallbackClassName,
}: {
  user: Pick<AppUser, "firstname" | "lastname" | "avatar">;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
      <AvatarFallback className={fallbackClassName ?? "bg-primary/10 text-xs font-semibold text-primary"}>
        {initials(user)}
      </AvatarFallback>
    </Avatar>
  );
}

const nav = [
  { href: "/dashboard", label: "Vue d’ensemble", icon: LayoutDashboard },
  { href: "/projects", label: "Projets", icon: BriefcaseBusiness },
  { href: "/network", label: "Réseau", icon: UserPlus },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/users", label: "Utilisateurs", icon: Users },
];

function UserAlert({
  tone = "error",
  title,
  detail,
  action,
}: {
  tone?: "error" | "warning" | "info" | "success";
  title: string;
  detail?: string;
  action?: string;
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-sky-200 bg-sky-50 text-sky-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  } as const;
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;
  return (
    <div className={`rounded-2xl border p-4 text-left text-sm ${styles[tone]}`} role="alert">
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 opacity-80" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{title}</p>
          {detail && <p className="leading-6 opacity-90">{detail}</p>}
          {action && <p className="pt-1 text-xs font-medium opacity-80">{action}</p>}
        </div>
      </div>
    </div>
  );
}

function AppLoading({ label = "Chargement de votre espace…", step }: { label?: string; step?: string }) {
  return (
    <div className="grid min-h-screen place-items-center hub-surface p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border/70 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Loader2 className="size-7 animate-spin" />
        </div>
        <p className="text-base font-semibold tracking-tight">Hubmaster</p>
        <p className="mt-2 text-sm text-muted-foreground">{label}</p>
        {step ? <p className="mt-1 text-xs text-muted-foreground/80">{step}</p> : null}
        <div className="mt-6 space-y-2">
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="mx-auto h-3 w-4/5 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/dashboard" className={`flex items-center gap-2.5 font-extrabold tracking-tight ${light ? "text-white" : "text-foreground"}`}>
      <span className={`grid size-9 place-items-center rounded-2xl shadow-sm ${light ? "bg-white/15 text-white ring-1 ring-white/20" : "bg-primary text-primary-foreground"}`}>
        <FolderOpen className="size-5" />
      </span>
      <span className="text-lg">Hubmaster</span>
    </Link>
  );
}

function AuthShell({
  mode,
  title,
  description,
  children,
}: {
  mode: "login" | "signup";
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen hub-surface lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[oklch(0.28_0.06_250)] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,oklch(0.65_0.12_230)_0,transparent_40%),radial-gradient(circle_at_85%_75%,oklch(0.55_0.1_250)_0,transparent_35%)]" />
        <div className="pointer-events-none absolute -right-16 top-20 size-80 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative"><Logo light /></div>
        <div className="relative my-auto max-w-lg hub-fade-up">
          <Badge className="mb-5 border-white/15 bg-white/10 text-white backdrop-blur">
            <Sparkles className="mr-1 size-3.5" />
            {mode === "login" ? "Espace de travail" : "Inscription rapide"}
          </Badge>
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight">
            {mode === "login"
              ? "Vos projets, fichiers et équipes au même endroit."
              : "Créez votre compte et votre photo de profil."}
          </h1>
          <p className="mt-6 text-lg leading-8 text-white/75">
            {mode === "login"
              ? "Connexion sécurisée pour retrouver immédiatement votre espace Hubmaster."
              : "En quelques secondes : identité, photo, puis accès direct à vos projets."}
          </p>
        </div>
        <p className="relative text-sm text-white/50">© 2026 Hubmaster</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-8">
        <Card className="w-full max-w-md border-border/70 shadow-2xl shadow-slate-300/40 hub-fade-up">
          <CardHeader className="space-y-5 p-7 pb-3 sm:p-8 sm:pb-4">
            <div className="lg:hidden"><Logo /></div>
            <div className="grid grid-cols-2 rounded-2xl bg-muted/80 p-1">
              <Link
                href="/login"
                className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition ${
                  mode === "login" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Connexion
              </Link>
              <Link
                href="/signup"
                className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition ${
                  mode === "signup" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Créer un compte
              </Link>
            </div>
            <div>
              <CardTitle className="text-3xl font-extrabold tracking-tight">{title}</CardTitle>
              <CardDescription className="mt-2 text-sm leading-6">{description}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-7 pt-2 sm:p-8 sm:pt-3">{children}</CardContent>
        </Card>
      </section>
    </main>
  );
}

function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);
  const [loginError, setLoginError] = useState<{ title: string; detail: string; action?: string } | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: isFirebaseConfigured
      ? { email: "", password: "" }
      : { email: "admin@projecthub.fr", password: "password" },
  });

  async function onSubmit(values: LoginValues) {
    setLoading(true);
    setWakingUp(false);
    setLoginError(null);
    const wakeTimer = window.setTimeout(() => setWakingUp(true), 4000);
    try {
      if (!isFirebaseConfigured) {
        setLoginError({
          title: "Configuration manquante",
          detail: "Le serveur n’a pas encore les variables Firebase nécessaires.",
          action: "Sur Render → Environment, ajoutez les variables, puis redéployez. Vérifiez /api/health.",
        });
        toast.error("Configuration serveur incomplète");
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const idToken = await credential.user.getIdToken();
      const session = await createServerSession(idToken);

      if (!session.ok) {
        const title = String(session.body.title ?? "Connexion impossible");
        const detail = String(session.body.error ?? "Impossible de créer la session.");
        const action = String(
          session.body.action ??
            "Réessayez dans quelques secondes. Si ça continue, le serveur est peut‑être en démarrage.",
        );
        setLoginError({ title, detail, action });
        toast.error(title);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      const nextError = explainClientAuthError(error);
      setLoginError(nextError);
      toast.error(nextError.title);
    } finally {
      window.clearTimeout(wakeTimer);
      setWakingUp(false);
      setLoading(false);
    }
  }

  return (
    <AuthShell
      mode="login"
      title="Bon retour"
      description="Connectez-vous pour accéder à votre espace Hubmaster."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {wakingUp && (
          <UserAlert
            tone="info"
            title="Démarrage du serveur…"
            detail="Le service gratuit Render se réveille. Patientez encore quelques secondes, ne quittez pas la page."
          />
        )}
        {loginError && (
          <UserAlert tone="error" title={loginError.title} detail={loginError.detail} action={loginError.action} />
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" className="h-11 rounded-xl" placeholder="vous@entreprise.com" {...register("email")} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <button type="button" className="text-xs font-medium text-primary">Mot de passe oublié ?</button>
          </div>
          <Input id="password" type="password" className="h-11 rounded-xl" {...register("password")} />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" className="h-11 w-full rounded-xl text-base" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {wakingUp ? "Démarrage…" : "Connexion…"}
            </>
          ) : (
            "Se connecter"
          )}
        </Button>
        <Button type="button" variant="outline" className="h-11 w-full rounded-xl text-base" render={<Link href="/signup" />}>
          Créer un compte
          <ArrowRight className="size-4" />
        </Button>
        {!isFirebaseConfigured && (
          <UserAlert
            tone="warning"
            title="Configuration manquante"
            detail="Les variables Firebase/Supabase ne sont pas détectées."
            action="Ajoutez-les sur Render, puis redéployez."
          />
        )}
      </form>
    </AuthShell>
  );
}


function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { register, handleSubmit, trigger, formState: { errors } } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { firstname: "", lastname: "", email: "", password: "", passwordConfirm: "" },
  });

  useEffect(() => {
    if (!avatarFile) {
      setPreview(null);
      return;
    }
    if (avatarFile.size > 2 * 1024 * 1024) {
      toast.error("La photo ne doit pas dépasser 2 Mo");
      setAvatarFile(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  async function goNext() {
    const ok = await trigger(["firstname", "lastname", "email", "password", "passwordConfirm"]);
    if (ok) setStep(2);
  }

  async function onSubmit(values: SignupValues) {
    setLoading(true);
    setError("");
    try {
      if (!isFirebaseConfigured) {
        setError("Firebase n’est pas configuré sur le serveur.");
        return;
      }
      const body = new FormData();
      body.append("firstname", values.firstname.trim());
      body.append("lastname", values.lastname.trim());
      body.append("email", values.email.trim());
      body.append("password", values.password);
      if (avatarFile) body.append("avatar", avatarFile);

      const response = await fetch("/api/register", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(String(payload.error ?? "Inscription impossible"));
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, values.email.trim(), values.password);
      const idToken = await credential.user.getIdToken();
      const session = await createServerSession(idToken);
      if (!session.ok) {
        setError(String(session.body.error ?? "Compte créé, mais la session a échoué. Connectez-vous."));
        router.push("/login");
        return;
      }
      toast.success("Compte créé — bienvenue !");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const mapped = explainClientAuthError(err);
      setError(`${mapped.title} — ${mapped.detail}`);
      toast.error(mapped.title);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      mode="signup"
      title="Créer un compte"
      description={step === 1 ? "Étape 1 · Vos informations" : "Étape 2 · Photo de profil (optionnel)"}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {error && <UserAlert tone="error" title="Inscription impossible" detail={error} action="Vérifiez vos infos ou réessayez dans quelques secondes si le serveur démarre." />}
        <div className="flex gap-2">
          <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
          <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
        </div>

        {step === 1 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Prénom</Label><Input className="h-11 rounded-xl" {...register("firstname")} />{errors.firstname && <p className="text-xs text-destructive">{errors.firstname.message}</p>}</div>
              <div className="space-y-2"><Label>Nom</Label><Input className="h-11 rounded-xl" {...register("lastname")} />{errors.lastname && <p className="text-xs text-destructive">{errors.lastname.message}</p>}</div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" className="h-11 rounded-xl" placeholder="vous@entreprise.com" {...register("email")} />{errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}</div>
            <div className="space-y-2"><Label>Mot de passe</Label><Input type="password" className="h-11 rounded-xl" {...register("password")} />{errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}</div>
            <div className="space-y-2"><Label>Confirmer le mot de passe</Label><Input type="password" className="h-11 rounded-xl" {...register("passwordConfirm")} />{errors.passwordConfirm && <p className="text-xs text-destructive">{errors.passwordConfirm.message}</p>}</div>
            <Button type="button" className="h-11 w-full rounded-xl text-base" onClick={goNext}>
              Continuer <ArrowRight className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/40 p-3">
              <label className="group relative cursor-pointer">
                <span className="grid size-20 place-items-center overflow-hidden rounded-2xl border bg-white shadow-inner">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="" className="size-full object-cover" />
                  ) : (
                    <Camera className="size-6 text-muted-foreground transition group-hover:text-primary" />
                  )}
                </span>
                <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                  <Plus className="size-3.5" />
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div>
                <p className="text-sm font-semibold">Photo de profil</p>
                <p className="text-xs text-muted-foreground">Optionnel · JPG, PNG, WebP · 2 Mo max</p>
                {avatarFile && (
                  <button type="button" className="mt-1 text-xs font-medium text-primary" onClick={() => setAvatarFile(null)}>
                    Retirer la photo
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => setStep(1)}>
                Retour
              </Button>
              <Button type="submit" className="h-11 flex-1 rounded-xl text-base" disabled={loading}>
                {loading ? "Création…" : <>Créer mon compte <ArrowRight className="size-4" /></>}
              </Button>
            </div>
          </>
        )}
      </form>
    </AuthShell>
  );
}

function Sidebar({ mobile = false, currentUser, onLogout, pendingFriends = 0 }: { mobile?: boolean; currentUser: AppUser; onLogout: () => void; pendingFriends?: number }) {
  const pathname = usePathname();
  const links = nav.filter((item) => item.href !== "/users" || currentUser.role === "admin");
  return (
    <div className="flex h-full flex-col bg-sidebar/80 p-5 backdrop-blur">
      <Logo />
      <nav className="mt-10 space-y-1">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Espace</p>
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href === "/projects" && pathname.startsWith("/projects/")) ||
            (href === "/messages" && pathname.startsWith("/messages"));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {href === "/network" && pendingFriends > 0 ? (
                <Badge className="rounded-full px-1.5 py-0 text-[10px]">{pendingFriends}</Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 border-t border-border/80 pt-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
          <UserAvatar user={currentUser} className="size-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentUser.firstname} {currentUser.lastname}</p>
            <p className="truncate text-xs text-muted-foreground">{roleLabel(currentUser.role)}</p>
          </div>
        </div>
        <nav className="space-y-1">
          <Link href="/profile" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><UserRound className="size-4" />Mon profil</Link>
          <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><Settings className="size-4" />Paramètres</Link>
          {mobile && <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><LogOut className="size-4" />Déconnexion</button>}
        </nav>
      </div>
    </div>
  );
}

function AppShell({ children, title, description, currentUser, onLogout, pendingFriends = 0 }: { children: React.ReactNode; title: string; description?: string; currentUser: AppUser; onLogout: () => void; pendingFriends?: number }) {
  return (
    <div className="min-h-screen hub-surface">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border/70 bg-white/70 lg:block">
        <Sidebar currentUser={currentUser} onLogout={onLogout} pendingFriends={pendingFriends} />
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-white/75 px-5 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" />}>
                <Menu />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <Sidebar mobile currentUser={currentUser} onLogout={onLogout} pendingFriends={pendingFriends} />
              </SheetContent>
            </Sheet>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{title}</h1>
              {description && <p className="hidden text-xs text-muted-foreground sm:block">{description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative rounded-xl" render={<Link href="/network" />}>
              <Bell className="size-4" />
              {pendingFriends > 0 ? (
                <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {pendingFriends}
                </span>
              ) : null}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="h-11 gap-3 rounded-xl px-2" />}>
                <UserAvatar user={currentUser} className="size-8" />
                <span className="hidden text-left text-sm sm:block">
                  <b className="block font-semibold">{currentUser.firstname} {currentUser.lastname}</b>
                  <span className="text-xs text-muted-foreground">{roleLabel(currentUser.role)}</span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href="/profile" />}>Mon profil</DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/settings" />}>Paramètres</DropdownMenuItem>
                <DropdownMenuItem onClick={onLogout}>Déconnexion</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  delayClass,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Files;
  accent: string;
  delayClass?: string;
}) {
  return (
    <Card className={`border-border/70 shadow-sm hub-stat-glow hub-fade-up ${delayClass ?? ""}`}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={`grid size-12 place-items-center rounded-2xl ${accent}`}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  return (
    <Card
      role="link"
      tabIndex={0}
      className="group cursor-pointer overflow-hidden border-border/70 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-slate-200/80"
      onClick={() => router.push(`/projects/${project.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(`/projects/${project.id}`);
        }
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:scale-105">
            <FolderOpen className="size-5" />
          </div>
          <Badge variant="secondary" className="rounded-lg">
            {project.files.length} fichier{project.files.length > 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="pt-3">
          <CardTitle className="text-lg font-bold group-hover:text-primary">{project.title}</CardTitle>
          <CardDescription className="mt-2 line-clamp-2 min-h-10">
            {project.description || "Aucune description"}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between border-t border-border/70 pt-4 text-xs text-muted-foreground">
          <span>{project.category || "Projet"}</span>
          <span>{formatDate(project.updatedAt)}</span>
        </div>
        <Button
          type="button"
          className="h-10 w-full rounded-xl"
          onClick={(event) => {
            event.stopPropagation();
            router.push(`/projects/${project.id}`);
          }}
        >
          Ouvrir le projet
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function Dashboard({ projects, currentUser, usersCount, onLogout, pendingFriends = 0 }: { projects: Project[]; currentUser: AppUser; usersCount?: number; onLogout: () => void; pendingFriends?: number }) {
  const [search, setSearch] = useState("");
  const visible = projects.filter((project) => project.title.toLowerCase().includes(search.toLowerCase()));
  const totalFiles = projects.reduce((sum, p) => sum + p.files.length, 0);
  const totalBytes = projects.reduce((sum, project) => sum + project.files.reduce((fileSum, file) => fileSum + file.size, 0), 0);
  const recent = visible.slice(0, 6);

  return (
    <AppShell
      title={`Bonjour ${currentUser.firstname}`}
      description="Voici l’activité de votre espace aujourd’hui."
      currentUser={currentUser}
      onLogout={onLogout}
      pendingFriends={pendingFriends}
    >
      <section className="mb-8 overflow-hidden rounded-3xl border border-border/70 bg-[oklch(0.28_0.06_250)] p-6 text-white shadow-lg shadow-slate-300/30 md:p-8 hub-fade-up">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <Badge className="mb-3 border-white/15 bg-white/10 text-white">Tableau de bord</Badge>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Tout est prêt pour avancer.</h2>
            <p className="mt-3 text-sm leading-6 text-white/70 md:text-base">
              {projects.length} projet{projects.length > 1 ? "s" : ""} · {totalFiles} fichier{totalFiles > 1 ? "s" : ""} · {formatBytes(totalBytes)} utilisés
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-xl bg-white text-slate-900 hover:bg-white/90" render={<Link href="/projects/new" />}>
              <Plus /> Nouveau projet
            </Button>
            <Button variant="outline" className="rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10" render={<Link href="/projects" />}>
              Voir les projets
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projets" value={projects.length} hint="Espaces actifs" icon={BriefcaseBusiness} accent="bg-sky-100 text-sky-700" delayClass="hub-fade-up-delay-1" />
        <StatCard label="Fichiers" value={totalFiles} hint="Tous projets confondus" icon={Files} accent="bg-teal-100 text-teal-700" delayClass="hub-fade-up-delay-2" />
        <StatCard label="Utilisateurs" value={usersCount ?? "—"} hint="Équipe visible" icon={Users} accent="bg-emerald-100 text-emerald-700" delayClass="hub-fade-up-delay-3" />
        <StatCard label="Stockage" value={formatBytes(totalBytes)} hint="Volume utilisé" icon={HardDrive} accent="bg-amber-100 text-amber-700" delayClass="hub-fade-up-delay-4" />
      </div>

      <section className="mt-8">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Projets récents</h2>
            <p className="text-sm text-muted-foreground">Retrouvez vos derniers espaces de travail.</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full rounded-xl pl-9 sm:w-56" />
            </div>
            <Button className="rounded-xl" render={<Link href="/projects/new" />}><Plus />Nouveau</Button>
          </div>
        </div>
        {recent.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recent.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <FolderOpen className="size-10 text-muted-foreground" />
              <p className="font-medium">Aucun projet pour le moment</p>
              <Button className="rounded-xl" render={<Link href="/projects/new" />}><Plus />Créer mon premier projet</Button>
            </CardContent>
          </Card>
        )}
      </section>
    </AppShell>
  );
}

function ProjectsPage({ projects, currentUser, onLogout, pendingFriends = 0 }: { projects: Project[]; currentUser: AppUser; onLogout: () => void; pendingFriends?: number }) {
  const canCreate = currentUser.role !== "user";
  return (
    <AppShell
      title="Projets"
      description="Ouvrez un projet pour lire et télécharger ses fichiers"
      currentUser={currentUser}
      onLogout={onLogout}
      pendingFriends={pendingFriends}
    >
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{projects.length} projet{projects.length > 1 ? "s" : ""}</h2>
          <p className="text-sm text-muted-foreground">Cliquez sur une carte ou sur « Ouvrir le projet ».</p>
        </div>
        {canCreate ? (
          <Button className="rounded-xl" render={<Link href="/projects/new" />}>
            <Plus /> Nouveau projet
          </Button>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="space-y-4 p-12 text-center">
            <FolderOpen className="mx-auto size-12 text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold">Aucun projet pour le moment</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {canCreate
                  ? "Créez votre premier espace pour y déposer des fichiers."
                  : "Demandez à un manager de vous ajouter à un projet."}
              </p>
            </div>
            {canCreate ? (
              <Button className="rounded-xl" render={<Link href="/projects/new" />}>
                <Plus /> Créer un projet
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function mergeSelectedFiles(current: File[], incoming: FileList | File[]) {
  const next = [...current];
  const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  for (const file of Array.from(incoming)) {
    if (!file.size) continue;
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

function FileDropzone({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | File[] | null) {
    if (!list || disabled) return;
    onChange(mergeSelectedFiles(files, list));
  }

  return (
    <div className="space-y-3">
      <div
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-slate-50 hover:border-primary/60"
        } ${disabled ? "opacity-60" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="mx-auto mb-3 size-7 text-primary" />
        <p className="text-sm font-semibold">Glissez des fichiers ou un dossier ici</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {files.length
            ? `${files.length} élément(s) prêt(s) à importer`
            : "PDF, images, vidéos, archives · max 50 Mo / fichier"}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" className="rounded-xl" disabled={disabled} onClick={() => fileInputRef.current?.click()}>
            <Files className="size-4" /> Choisir des fichiers
          </Button>
          <Button type="button" variant="outline" className="rounded-xl" disabled={disabled} onClick={() => folderInputRef.current?.click()}>
            <Folder className="size-4" /> Importer un dossier
          </Button>
          {files.length > 0 && (
            <Button type="button" variant="ghost" className="rounded-xl" disabled={disabled} onClick={() => onChange([])}>
              Vider la sélection
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            addFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          // @ts-expect-error webkitdirectory is supported in Chromium browsers
          webkitdirectory=""
          onChange={(event) => {
            addFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border bg-white p-3 text-left">
          {files.slice(0, 30).map((file) => (
            <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">
                {"webkitRelativePath" in file && file.webkitRelativePath
                  ? String(file.webkitRelativePath)
                  : file.name}
              </span>
              <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
            </div>
          ))}
          {files.length > 30 && (
            <p className="text-xs text-muted-foreground">+{files.length - 30} autres…</p>
          )}
        </div>
      )}
    </div>
  );
}

function NewProjectPage({ currentUser, onLogout, pendingFriends = 0 }: { currentUser: AppUser; onLogout: () => void; pendingFriends?: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const canUpload = currentUser.role !== "user";
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { title: "", description: "", category: "", client: "" },
  });
  const mutation = useMutation({
    mutationFn: async (values: ProjectValues) => {
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => body.append(key, value));
      files.forEach((file) => body.append("files", file));
      const response = await fetch("/api/projects", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error ?? "La création a échoué"));
      return payload as Project;
    },
    onSuccess: (project) => {
      queryClient.setQueryData<Project[]>(["projects"], (current = []) => [project, ...current]);
      toast.success(
        project.files?.length
          ? `Projet créé avec ${project.files.length} fichier(s)`
          : "Projet créé",
      );
      router.push(`/projects/${project.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell title="Nouveau projet" description="Créez un espace et ajoutez vos premiers fichiers." currentUser={currentUser} onLogout={onLogout} pendingFriends={pendingFriends}>
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" render={<Link href="/projects" />} className="mb-4"><ArrowLeft />Retour</Button>
        <Card>
          <CardHeader>
            <CardTitle>Informations du projet</CardTitle>
            <CardDescription>Vous pourrez modifier ces informations plus tard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-6">
              <div className="space-y-2"><Label>Nom du projet *</Label><Input placeholder="Ex. Refonte du site" {...register("title")} />{errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}</div>
              <div className="space-y-2"><Label>Description</Label><Textarea rows={4} placeholder="Décrivez l’objectif du projet…" {...register("description")} /></div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select onValueChange={(value) => setValue("category", String(value))}>
                    <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Design">Design</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Application">Application</SelectItem>
                      <SelectItem value="Autre">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Client</Label><Input placeholder="Nom du client" {...register("client")} /></div>
              </div>
              <div className="space-y-2">
                <Label>Importer des fichiers / dossier</Label>
                {canUpload ? (
                  <FileDropzone files={files} onChange={setFiles} disabled={mutation.isPending} />
                ) : (
                  <UserAlert
                    tone="warning"
                    title="Import réservé"
                    detail="Votre rôle Utilisateur ne permet pas d’importer des fichiers. Demandez à un manager ou admin."
                  />
                )}
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()}>Annuler</Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? (<><Loader2 className="size-4 animate-spin" /> Création…</>) : "Créer le projet"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}


function FileIcon({ file }: { file: ProjectFile }) {
  if (["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(file.extension)) {
    return <ImageIcon className="size-5 text-violet-600" />;
  }
  if (["mp4", "mov", "avi", "webm"].includes(file.extension)) {
    return <Video className="size-5 text-rose-600" />;
  }
  return <FileText className="size-5 text-blue-600" />;
}

function canPreviewFile(file: ProjectFile) {
  const ext = file.extension.toLowerCase();
  return ["png", "jpg", "jpeg", "svg", "webp", "gif", "pdf"].includes(ext) && hasFileLink(file);
}

function hasFileLink(file: ProjectFile) {
  return Boolean(file.url) && file.url !== "#";
}

function fileOpenHref(projectId: string, file: ProjectFile) {
  if (file.url?.startsWith("/api/")) return file.url;
  if (file.url && file.url !== "#") return file.url;
  return `/api/projects/${projectId}/files/${file.id}`;
}

function ProjectDetail({ project, currentUser, onLogout, pendingFriends = 0 }: { project?: Project; currentUser: AppUser; onLogout: () => void; pendingFriends?: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [memberId, setMemberId] = useState("");
  const canUpload = currentUser.role !== "user";

  const { data: directory = [] } = useQuery({
    queryKey: ["directory"],
    queryFn: async () => {
      const response = await fetch("/api/users?directory=1", { cache: "no-store" });
      if (!response.ok) return [] as AppUser[];
      return response.json() as Promise<AppUser[]>;
    },
    enabled: canUpload,
  });

  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload: File[]) => {
      if (!project) throw new Error("Projet introuvable");
      const body = new FormData();
      filesToUpload.forEach((file) => {
        body.append("files", file);
        const relative =
          "webkitRelativePath" in file && typeof file.webkitRelativePath === "string"
            ? file.webkitRelativePath
            : "";
        body.append("folders", relative);
      });
      const response = await fetch(`/api/projects/${project.id}/files`, { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload.error ?? "Import impossible"));
      }
      return payload as {
        files: ProjectFile[];
        uploaded: number;
        failed: number;
        details?: string[];
      };
    },
    onSuccess: (result) => {
      queryClient.setQueryData<Project[]>(["projects"], (current = []) =>
        current.map((item) =>
          item.id === project?.id
            ? { ...item, files: [...result.files, ...item.files], updatedAt: new Date().toISOString() }
            : item,
        ),
      );
      setPendingFiles([]);
      setShowUploader(false);
      if (result.failed > 0) {
        toast.warning(`${result.uploaded} importé(s), ${result.failed} échec(s)`);
      } else {
        toast.success(`${result.uploaded} fichier(s) importé(s)`);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      if (!project) throw new Error("Projet introuvable");
      const response = await fetch(`/api/projects/${project.id}/files/${fileId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error ?? "Suppression impossible"));
      return fileId;
    },
    onSuccess: (fileId) => {
      queryClient.setQueryData<Project[]>(["projects"], (current = []) =>
        current.map((item) =>
          item.id === project?.id
            ? { ...item, files: item.files.filter((f) => f.id !== fileId) }
            : item,
        ),
      );
      if (previewFile?.id === fileId) setPreviewFile(null);
      toast.success("Fichier supprimé");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("Projet introuvable");
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error ?? "Suppression impossible"));
    },
    onSuccess: () => {
      queryClient.setQueryData<Project[]>(["projects"], (current = []) =>
        current.filter((item) => item.id !== project?.id),
      );
      toast.success("Projet supprimé");
      router.push("/projects");
    },
    onError: (error) => toast.error(error.message),
  });

  const membersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      if (!project) throw new Error("Projet introuvable");
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error ?? "Mise à jour impossible"));
      return payload as Project;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Project[]>(["projects"], (current = []) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated, files: item.files } : item)),
      );
      setMemberId("");
      toast.success("Membres mis à jour");
    },
    onError: (error) => toast.error(error.message),
  });

  if (!project) {
    return (
      <AppShell title="Projet introuvable" currentUser={currentUser} onLogout={onLogout} pendingFriends={pendingFriends}>
        <Card>
          <CardContent className="space-y-4 p-10 text-center">
            <FolderOpen className="mx-auto size-10 text-muted-foreground" />
            <p className="font-medium">Ce projet n’existe pas ou vous n’y avez pas accès.</p>
            <Button render={<Link href="/projects" />} className="rounded-xl">
              Retour aux projets
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const memberOptions = directory.filter((u) => !project.memberIds.includes(u.id));

  return (
    <AppShell
      title={project.title}
      description="Consultez, ouvrez et téléchargez les fichiers du projet"
      currentUser={currentUser}
      onLogout={onLogout}
      pendingFriends={pendingFriends}
    >
      <div className="mb-6 flex flex-col justify-between gap-4 rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" render={<Link href="/projects" />} className="-ml-2 mb-2 rounded-xl">
            <ArrowLeft /> Tous les projets
          </Button>
          <h2 className="truncate text-2xl font-extrabold tracking-tight">{project.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.category || "Projet"} · {project.client || "Client interne"} · {project.files.length} fichier(s)
          </p>
          {project.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{project.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpload ? (
            <>
              <Button className="h-11 shrink-0 rounded-xl" onClick={() => setShowUploader((value) => !value)}>
                <Upload />
                {showUploader ? "Fermer l’import" : "Importer des fichiers"}
              </Button>
              <Button
                variant="destructive"
                className="h-11 rounded-xl"
                disabled={deleteProjectMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Supprimer définitivement « ${project.title} » et tous ses fichiers ?`)) {
                    deleteProjectMutation.mutate();
                  }
                }}
              >
                <Trash2 className="size-4" /> Supprimer
              </Button>
            </>
          ) : (
            <Badge variant="secondary" className="rounded-lg px-3 py-1.5">Lecture & téléchargement</Badge>
          )}
        </div>
      </div>

      {canUpload && (
        <Card className="mb-6 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Membres du projet</CardTitle>
            <CardDescription>{project.memberIds.length} membre(s) · ajoutez des comptes visibles (hors admins).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Select value={memberId || undefined} onValueChange={(value) => setMemberId(String(value ?? ""))}>
              <SelectTrigger className="rounded-xl sm:max-w-sm"><SelectValue placeholder="Choisir un membre" /></SelectTrigger>
              <SelectContent>
                {memberOptions.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstname} {user.lastname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              className="rounded-xl"
              disabled={!memberId || membersMutation.isPending}
              onClick={() => membersMutation.mutate([...project.memberIds, memberId])}
            >
              <UserPlus className="size-4" /> Ajouter
            </Button>
          </CardContent>
        </Card>
      )}

      {showUploader && canUpload && (
        <Card className="mb-6 border-primary/25 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Importer dans ce projet</CardTitle>
            <CardDescription>Ajoutez des fichiers ou un dossier entier, puis validez.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileDropzone files={pendingFiles} onChange={setPendingFiles} disabled={uploadMutation.isPending} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" disabled={uploadMutation.isPending} onClick={() => { setPendingFiles([]); setShowUploader(false); }}>
                Annuler
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={uploadMutation.isPending || pendingFiles.length === 0}
                onClick={() => uploadMutation.mutate(pendingFiles)}
              >
                {uploadMutation.isPending ? (
                  <><Loader2 className="size-4 animate-spin" /> Import en cours…</>
                ) : (
                  <>Valider l’import ({pendingFiles.length})</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Fichiers du projet</CardTitle>
            <CardDescription>
              Cliquez sur <b>Ouvrir</b> pour lire, ou <b>Télécharger</b> pour enregistrer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {project.files.length === 0 ? (
              <div className="space-y-4 rounded-2xl border border-dashed p-10 text-center">
                <Files className="mx-auto size-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">Aucun fichier pour l’instant</p>
                  <p className="mt-1 text-sm text-muted-foreground">Importez un document pour commencer.</p>
                </div>
                {canUpload && (
                  <Button className="rounded-xl" onClick={() => setShowUploader(true)}>
                    <Upload />Importer maintenant
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {project.files.map((file) => {
                  const href = fileOpenHref(project.id, file);
                  const hasUrl = hasFileLink(file) || Boolean(file.id);
                  const previewable = canPreviewFile(file) || (hasUrl && ["png", "jpg", "jpeg", "svg", "webp", "gif", "pdf"].includes(file.extension.toLowerCase()));
                  return (
                    <div
                      key={file.id}
                      className="flex flex-col gap-3 rounded-2xl border bg-slate-50/70 p-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="grid size-11 place-items-center rounded-xl bg-white shadow-sm">
                          <FileIcon file={file} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{file.originalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.folder ? `${file.folder} · ` : ""}
                            {formatBytes(file.size)} · {formatDate(file.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {previewable && (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => setPreviewFile({ ...file, url: href })}
                          >
                            <Eye className="size-4" /> Lire
                          </Button>
                        )}
                        {hasUrl ? (
                          <>
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
                            >
                              <ExternalLink className="size-4" /> Ouvrir
                            </a>
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              <Download className="size-4" /> Télécharger
                            </a>
                          </>
                        ) : (
                          <Badge variant="outline">Lien indisponible</Badge>
                        )}
                        {canUpload && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-xl text-destructive"
                            disabled={deleteFileMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Supprimer « ${file.originalName} » ?`)) {
                                deleteFileMutation.mutate(file.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Aperçu</CardTitle>
            <CardDescription>
              {previewFile ? previewFile.originalName : "Sélectionnez « Lire » sur un fichier PDF ou image."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewFile && (canPreviewFile(previewFile) || previewFile.url) ? (
              <div className="overflow-hidden rounded-2xl border bg-white">
                {previewFile.extension.toLowerCase() === "pdf" ? (
                  <iframe title={previewFile.originalName} src={previewFile.url} className="h-[28rem] w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewFile.url} alt={previewFile.originalName} className="max-h-[28rem] w-full object-contain" />
                )}
              </div>
            ) : (
              <div className="grid h-64 place-items-center rounded-2xl border border-dashed text-center text-sm text-muted-foreground">
                <div>
                  <Eye className="mx-auto mb-2 size-8 opacity-50" />
                  Aucun aperçu actif
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

const userSchema = z.object({
  firstname: z.string().min(2, "Prénom requis"),
  lastname: z.string().min(2, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
  role: z.enum(["admin", "manager", "user"]),
});

type UserFormValues = z.infer<typeof userSchema>;

function UsersPage({ currentUser, onLogout, pendingFriends = 0 }: { currentUser: AppUser; onLogout: () => void; pendingFriends?: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: users = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: getUsers });
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { firstname: "", lastname: "", email: "", password: "", role: "user" },
  });
  const mutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Création impossible");
      return body as AppUser;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur créé");
      reset();
      setOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error ?? "Mise à jour impossible"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Rôle mis à jour");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error ?? "Suppression impossible"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Utilisateur supprimé");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roleStyle: Record<Role, string> = { admin: "bg-violet-100 text-violet-700", manager: "bg-blue-100 text-blue-700", user: "bg-slate-100 text-slate-700" };

  return (
    <AppShell title="Utilisateurs" description="Administration des comptes (visible uniquement pour les admins)." currentUser={currentUser} onLogout={onLogout} pendingFriends={pendingFriends}>
      <div className="mb-5 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button className="rounded-xl"><Plus />Créer un utilisateur</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel utilisateur</DialogTitle>
              <DialogDescription>Crée un compte Firebase Auth et son profil Firestore.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Prénom</Label><Input {...register("firstname")} />{errors.firstname && <p className="text-xs text-destructive">{errors.firstname.message}</p>}</div>
                <div className="space-y-2"><Label>Nom</Label><Input {...register("lastname")} />{errors.lastname && <p className="text-xs text-destructive">{errors.lastname.message}</p>}</div>
              </div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" {...register("email")} />{errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}</div>
              <div className="space-y-2"><Label>Mot de passe temporaire</Label><Input type="password" {...register("password")} />{errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}</div>
              <div className="space-y-2"><Label>Rôle</Label><Select defaultValue="user" onValueChange={(value) => setValue("role", value as Role)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Administrateur</SelectItem><SelectItem value="manager">Manager</SelectItem><SelectItem value="user">Utilisateur</SelectItem></SelectContent></Select></div>
              <Button type="submit" className="w-full rounded-xl" disabled={mutation.isPending}>{mutation.isPending ? "Création…" : "Créer l’utilisateur"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="divide-y">
              {users.map((user) => (
                <div key={user.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:px-6">
                  <UserAvatar user={user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.firstname} {user.lastname}{user.id === currentUser.id ? " (vous)" : ""}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge className={roleStyle[user.role]}>{roleLabel(user.role)}</Badge>
                  {user.id !== currentUser.id && (
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={user.role}
                        onValueChange={(value) => roleMutation.mutate({ id: user.id, role: value as Role })}
                      >
                        <SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-xl text-destructive"
                        onClick={() => {
                          if (window.confirm(`Supprimer le compte de ${user.firstname} ${user.lastname} ?`)) {
                            deleteMutation.mutate(user.id);
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function ProfilePage({ currentUser, onLogout, pendingFriends = 0 }: { currentUser: AppUser; onLogout: () => void; pendingFriends?: number }) {
  const queryClient = useQueryClient();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUser.avatar ?? null);
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { firstname: currentUser.firstname, lastname: currentUser.lastname },
  });

  useEffect(() => {
    if (avatarFile) {
      if (avatarFile.size > 2 * 1024 * 1024) {
        toast.error("La photo ne doit pas dépasser 2 Mo");
        setAvatarFile(null);
        return;
      }
      const url = URL.createObjectURL(avatarFile);
      setPreview(url);
      setRemoveAvatar(false);
      return () => URL.revokeObjectURL(url);
    }
    if (removeAvatar) {
      setPreview(null);
      return;
    }
    setPreview(currentUser.avatar ?? null);
  }, [avatarFile, currentUser.avatar, removeAvatar]);

  const mutation = useMutation({
    mutationFn: async (values: { firstname: string; lastname: string }) => {
      const body = new FormData();
      body.append("firstname", values.firstname.trim());
      body.append("lastname", values.lastname.trim());
      if (avatarFile) body.append("avatar", avatarFile);
      if (removeAvatar && !avatarFile) body.append("removeAvatar", "1");
      const response = await fetch("/api/me", { method: "PATCH", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Mise à jour impossible");
      return payload as AppUser;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["me"], user);
      setAvatarFile(null);
      setRemoveAvatar(false);
      toast.success("Profil mis à jour");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell title="Mon profil" description="Identité, photo et informations personnelles." currentUser={currentUser} onLogout={onLogout} pendingFriends={pendingFriends}>
      <Card className="max-w-2xl border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="font-bold">Informations personnelles</CardTitle>
          <CardDescription>Rôle : {roleLabel(currentUser.role)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-5">
            <div className="flex items-center gap-4">
              <label className="group relative cursor-pointer">
                <span className="grid size-20 place-items-center overflow-hidden rounded-2xl border bg-muted shadow-inner">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-primary">{initials(currentUser)}</span>
                  )}
                </span>
                <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                  <Camera className="size-3.5" />
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    setAvatarFile(e.target.files?.[0] ?? null);
                    setRemoveAvatar(false);
                  }}
                />
              </label>
              <div>
                <p className="text-sm font-semibold">Photo de profil</p>
                <p className="text-xs text-muted-foreground">JPG, PNG ou WebP · 2 Mo max</p>
                {(preview || currentUser.avatar) && (
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-destructive"
                    onClick={() => {
                      setAvatarFile(null);
                      setRemoveAvatar(true);
                    }}
                  >
                    Retirer la photo
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2"><Label>Prénom</Label><Input className="h-11 rounded-xl" {...register("firstname", { required: true })} />{errors.firstname && <p className="text-xs text-destructive">Prénom requis</p>}</div>
              <div className="space-y-2"><Label>Nom</Label><Input className="h-11 rounded-xl" {...register("lastname", { required: true })} />{errors.lastname && <p className="text-xs text-destructive">Nom requis</p>}</div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input value={currentUser.email} disabled className="h-11 rounded-xl" /></div>
            <Button type="submit" className="rounded-xl" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function SettingsPage({ currentUser, onLogout, pendingFriends = 0 }: { currentUser: AppUser; onLogout: () => void; pendingFriends?: number }) {
  return (
    <AppShell title="Paramètres" description="Configurez votre espace Hubmaster." currentUser={currentUser} onLogout={onLogout} pendingFriends={pendingFriends}>
      <Card className="max-w-2xl"><CardHeader><CardTitle>Préférences générales</CardTitle></CardHeader><CardContent className="space-y-5">
        <div className="space-y-2"><Label>Nom de l’espace</Label><Input defaultValue="Hubmaster" /></div>
        <div className="space-y-2"><Label>Langue</Label><Select defaultValue="fr"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fr">Français</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></div>
        <Button onClick={() => toast.success("Modifications enregistrées")}>Enregistrer</Button>
      </CardContent></Card>
    </AppShell>
  );
}

export function ProjectHubApp({ slug }: { slug: string[] }) {
  const route = slug.join("/");
  const router = useRouter();
  const {
    data: currentUser,
    isLoading: userLoading,
    isError: userError,
    error: userQueryError,
  } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: route !== "login" && route !== "signup",
    retry: false,
  });
  const { data: projects = [], isLoading: projectsLoading, isError: projectsError } = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
    enabled: route !== "login" && route !== "signup" && !!currentUser,
    retry: 1,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    enabled: route !== "login" && route !== "signup" && !!currentUser && currentUser.role === "admin",
    retry: 1,
  });
  const { data: friendsPayload } = useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const response = await fetch("/api/friends", { cache: "no-store" });
      if (!response.ok) return { pendingIncoming: [] as { id: string }[] };
      return response.json();
    },
    enabled: route !== "login" && route !== "signup" && !!currentUser,
    refetchInterval: 10000,
  });
  const pendingFriends = friendsPayload?.pendingIncoming?.length ?? 0;
  const project = useMemo(
    () => (route.startsWith("projects/") && slug[1] !== "new" ? projects.find((item) => item.id === slug[1]) : undefined),
    [projects, route, slug],
  );

  useEffect(() => {
    if (route === "login" || route === "signup") return;
    if (userError) {
      router.replace("/login");
    }
  }, [userError, route, router]);

  useEffect(() => {
    if (projectsError) toast.error("Impossible de charger les projets");
  }, [projectsError]);

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  if (route === "login") return <LoginPage />;
  if (route === "signup") return <SignupPage />;

  if (userLoading) {
    return <AppLoading label="Chargement de votre espace…" step="Vérification de la session" />;
  }

  if (userError || !currentUser) {
    return (
      <div className="grid min-h-screen place-items-center hub-surface p-6">
        <Card className="w-full max-w-md border-border/70 shadow-xl">
          <CardContent className="space-y-4 p-8 text-center">
            <FolderOpen className="mx-auto size-10 text-primary" />
            <UserAlert
              tone="warning"
              title={userQueryError?.message === "SESSION_EXPIRED" ? "Session expirée" : "Profil inaccessible"}
              detail={
                userQueryError?.message === "SESSION_EXPIRED"
                  ? "Votre session a expiré. Reconnectez-vous pour continuer."
                  : "Impossible de charger votre profil. Le serveur peut être en démarrage ou mal configuré."
              }
              action="Si la page Render « Application loading » apparaît, attendez 30–60 s puis réessayez."
            />
            <Button className="w-full rounded-xl" render={<Link href="/login" />}>
              Se connecter
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (projectsLoading) {
    return <AppLoading label="Chargement de vos projets…" step="Récupération des espaces" />;
  }

  if (route === "dashboard") {
    return (
      <Dashboard
        projects={projects}
        currentUser={currentUser}
        usersCount={currentUser.role === "admin" ? users.length : undefined}
        onLogout={handleLogout}
        pendingFriends={pendingFriends}
      />
    );
  }
  if (route === "projects") {
    return <ProjectsPage projects={projects} currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends} />;
  }
  if (route === "projects/new") {
    return <NewProjectPage currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends} />;
  }
  if (route.startsWith("projects/")) {
    return <ProjectDetail project={project} currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends} />;
  }
  if (route === "network") {
    return (
      <AppShell title="Réseau" description="Annuaire, amis et demandes" currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends}>
        <NetworkContent currentUser={currentUser} />
      </AppShell>
    );
  }
  if (route === "messages" || route.startsWith("messages/")) {
    return (
      <AppShell title="Messages" description="Discussions privées entre amis" currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends}>
        <MessagesContent currentUser={currentUser} conversationId={slug[1]} />
      </AppShell>
    );
  }
  if (route === "users") {
    return currentUser.role === "admin" ? (
      <UsersPage currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends} />
    ) : (
      <Dashboard projects={projects} currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends} />
    );
  }
  if (route === "profile") {
    return <ProfilePage currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends} />;
  }
  if (route === "settings") {
    return <SettingsPage currentUser={currentUser} onLogout={handleLogout} pendingFriends={pendingFriends} />;
  }
  return (
    <Dashboard
      projects={projects}
      currentUser={currentUser}
      usersCount={currentUser.role === "admin" ? users.length : undefined}
      onLogout={handleLogout}
      pendingFriends={pendingFriends}
    />
  );
}
