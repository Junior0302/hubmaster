"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signInWithEmailAndPassword } from "firebase/auth";
import { z } from "zod";
import {
  ArrowLeft, Bell, BriefcaseBusiness, ChevronRight, Download, FileText,
  Files, FolderOpen, HardDrive, ImageIcon, LayoutDashboard, LogOut, Menu,
  MoreHorizontal, Plus, Search, Settings, Trash2, Upload, UserRound, Users, Video,
} from "lucide-react";
import { toast } from "sonner";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { formatDate } from "@/lib/dates";
import { roleLabel } from "@/lib/roles";
import type { AppUser, Project, ProjectFile, Role } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const loginSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
});

const projectSchema = z.object({
  title: z.string().min(2, "Le nom est requis"),
  description: z.string().max(500),
  category: z.string(),
  client: z.string(),
});

type LoginValues = z.infer<typeof loginSchema>;
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

function initials(user: AppUser) {
  return `${user.firstname[0] ?? ""}${user.lastname[0] ?? ""}`.toUpperCase() || "?";
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} Ko`;
  return `${(bytes / 1_000_000).toFixed(1)} Mo`;
}

const nav = [
  { href: "/dashboard", label: "Vue d’ensemble", icon: LayoutDashboard },
  { href: "/projects", label: "Projets", icon: BriefcaseBusiness },
  { href: "/users", label: "Utilisateurs", icon: Users },
];

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 font-bold tracking-tight">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <FolderOpen className="size-5" />
      </span>
      <span className="text-lg">ProjectHub</span>
    </Link>
  );
}

function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<{ title: string; detail: string; action?: string } | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: isFirebaseConfigured
      ? { email: "", password: "" }
      : { email: "admin@projecthub.fr", password: "password" },
  });

  async function onSubmit(values: LoginValues) {
    setLoading(true);
    setLoginError(null);
    try {
      if (!isFirebaseConfigured) {
        const health = await fetch("/api/health").then((r) => r.json()).catch(() => null);
        setLoginError({
          title: "Configuration Firebase absente",
          detail:
            "Les variables NEXT_PUBLIC_FIREBASE_* et FIREBASE_* ne sont pas définies sur le serveur.",
          action:
            "Sur Render → Environment, ajoutez toutes les variables (voir README), puis Manual Deploy. Vérifiez ensuite /api/health : adminConfigured doit être true.",
        });
        toast.error("Variables d’environnement manquantes sur Render");
        console.warn("[login] health", health);
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const idToken = await credential.user.getIdToken();
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

      if (!response.ok) {
        const title = String(body.title ?? `Erreur de session (${response.status})`);
        const detail = String(body.error ?? "Impossible de créer la session serveur.");
        const action = String(
          body.action ??
            "Sur Render → Environment, vérifiez FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY_BASE64, puis redéployez. Testez /api/health.",
        );
        setLoginError({ title, detail, action });
        toast.error(`${title} — ${detail}`);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
      let nextError: { title: string; detail: string; action?: string };
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        nextError = {
          title: "Identifiants incorrects",
          detail: "Email ou mot de passe Firebase invalide.",
          action: "Utilisez le compte créé dans Firebase Authentication (ex. johnjuniort40@gmail.com).",
        };
      } else if (code === "auth/unauthorized-domain") {
        nextError = {
          title: "Domaine non autorisé",
          detail: "Firebase refuse ce domaine.",
          action: "Ajoutez hubmaster.onrender.com dans Firebase → Authentication → Domaines autorisés.",
        };
      } else {
        nextError = {
          title: "Connexion impossible",
          detail: error instanceof Error ? error.message : "Erreur inconnue",
          action: "Vérifiez Firebase Auth et les variables Render.",
        };
      }
      setLoginError(nextError);
      toast.error(`${nextError.title} — ${nextError.detail}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f5f7fb] lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#172554] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_25%_25%,#60a5fa_0,transparent_35%),radial-gradient(circle_at_80%_70%,#818cf8_0,transparent_30%)]" />
        <div className="relative"><Logo /></div>
        <div className="relative my-auto max-w-lg">
          <Badge className="mb-5 border-white/20 bg-white/10 text-white">Espace de travail centralisé</Badge>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">Vos projets, fichiers et équipes réunis au même endroit.</h1>
          <p className="mt-6 text-lg leading-8 text-blue-100">Une plateforme simple et sécurisée pour garder chaque livrable organisé.</p>
        </div>
        <p className="relative text-sm text-blue-200">© 2026 ProjectHub</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-0 shadow-xl shadow-slate-200/70">
          <CardHeader className="space-y-3 p-8 pb-4">
            <div className="lg:hidden"><Logo /></div>
            <CardTitle className="text-3xl">Bon retour !</CardTitle>
            <CardDescription>Connectez-vous pour accéder à votre espace.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {loginError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-800">
                  <p className="font-semibold">{loginError.title}</p>
                  <p className="mt-1 text-red-700">{loginError.detail}</p>
                  {loginError.action && <p className="mt-2 text-xs text-red-600">{loginError.action}</p>}
                </div>
              )}
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" {...register("email")} />{errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}</div>
              <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="password">Mot de passe</Label><button type="button" className="text-xs font-medium text-primary">Mot de passe oublié ?</button></div><Input id="password" type="password" {...register("password")} />{errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}</div>
              <Button type="submit" className="h-11 w-full" disabled={loading}>{loading ? "Connexion…" : "Se connecter"}</Button>
              {!isFirebaseConfigured && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900">
                  <b>Config manquante.</b> Sur Render → Environment, ajoutez les variables Firebase/Supabase puis redéployez.
                  Testez ensuite l’URL <code className="rounded bg-amber-100 px-1">/api/health</code> :{" "}
                  <code>adminConfigured</code> doit être <code>true</code>.
                </p>
              )}
              {isFirebaseConfigured && (
                <p className="rounded-lg bg-blue-50 p-3 text-center text-xs text-blue-700">
                  Connexion Firebase active. Utilisez votre email Firebase (pas le compte démo).
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Sidebar({ mobile = false, currentUser, onLogout }: { mobile?: boolean; currentUser: AppUser; onLogout: () => void }) {
  const pathname = usePathname();
  const links = nav.filter((item) => item.href !== "/users" || currentUser.role !== "user");
  return (
    <div className="flex h-full flex-col bg-white p-5">
      <Logo />
      <nav className="mt-10 space-y-1">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Espace de travail</p>
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/projects" && pathname.startsWith("/projects/"));
          return <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}><Icon className="size-4" />{label}</Link>;
        })}
      </nav>
      <nav className="mt-auto space-y-1 border-t pt-4">
        <Link href="/profile" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><UserRound className="size-4" />Mon profil</Link>
        <Link href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><Settings className="size-4" />Paramètres</Link>
        {mobile && <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><LogOut className="size-4" />Déconnexion</button>}
      </nav>
    </div>
  );
}

function AppShell({ children, title, description, currentUser, onLogout }: { children: React.ReactNode; title: string; description?: string; currentUser: AppUser; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r lg:block"><Sidebar currentUser={currentUser} onLogout={onLogout} /></aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b bg-white/90 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <Sheet><SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" />}><Menu /></SheetTrigger><SheetContent side="left" className="w-64 p-0"><Sidebar mobile currentUser={currentUser} onLogout={onLogout} /></SheetContent></Sheet>
            <div><h1 className="text-lg font-semibold">{title}</h1>{description && <p className="hidden text-xs text-muted-foreground sm:block">{description}</p>}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-500" /></Button>
            <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" className="h-11 gap-3 px-2" />}><Avatar className="size-8"><AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700">{initials(currentUser)}</AvatarFallback></Avatar><span className="hidden text-left text-sm sm:block"><b className="block">{currentUser.firstname} {currentUser.lastname}</b><span className="text-xs text-muted-foreground">{roleLabel(currentUser.role)}</span></span></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem render={<Link href="/profile" />}>Mon profil</DropdownMenuItem><DropdownMenuItem render={<Link href="/settings" />}>Paramètres</DropdownMenuItem><DropdownMenuItem onClick={onLogout}>Déconnexion</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </div>
        </header>
        <main className="p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: typeof Files; accent: string }) {
  return <Card className="border-slate-200/80 shadow-sm"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p></div><div className={`grid size-11 place-items-center rounded-xl ${accent}`}><Icon className="size-5" /></div></CardContent></Card>;
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card className="group overflow-hidden border-slate-200/80 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between"><div className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><FolderOpen className="size-5" /></div><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem>Modifier</DropdownMenuItem><DropdownMenuItem className="text-destructive">Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        <div className="pt-3"><Link href={`/projects/${project.id}`}><CardTitle className="text-lg group-hover:text-primary">{project.title}</CardTitle></Link><CardDescription className="mt-2 line-clamp-2 min-h-10">{project.description}</CardDescription></div>
      </CardHeader>
      <CardContent><div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Files className="size-3.5" />{project.files.length} fichiers</span><span>{formatDate(project.updatedAt)}</span></div></CardContent>
    </Card>
  );
}

function Dashboard({ projects, currentUser, usersCount, onLogout }: { projects: Project[]; currentUser: AppUser; usersCount?: number; onLogout: () => void }) {
  const [search, setSearch] = useState("");
  const visible = projects.filter((project) => project.title.toLowerCase().includes(search.toLowerCase()));
  const totalBytes = projects.reduce((sum, project) => sum + project.files.reduce((fileSum, file) => fileSum + file.size, 0), 0);
  return (
    <AppShell title={`Bonjour ${currentUser.firstname} 👋`} description="Voici ce qui se passe dans vos projets aujourd’hui." currentUser={currentUser} onLogout={onLogout}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projets" value={projects.length} icon={BriefcaseBusiness} accent="bg-blue-50 text-blue-700" />
        <StatCard label="Fichiers" value={projects.reduce((sum, p) => sum + p.files.length, 0)} icon={Files} accent="bg-violet-50 text-violet-700" />
        <StatCard label="Utilisateurs" value={usersCount ?? "—"} icon={Users} accent="bg-emerald-50 text-emerald-700" />
        <StatCard label="Stockage utilisé" value={formatBytes(totalBytes)} icon={HardDrive} accent="bg-amber-50 text-amber-700" />
      </div>
      <section className="mt-8">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-xl font-semibold">Projets récents</h2><p className="text-sm text-muted-foreground">Retrouvez vos derniers espaces de travail.</p></div><div className="flex gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full pl-9 sm:w-56" /></div><Button render={<Link href="/projects/new" />}><Plus />Nouveau projet</Button></div></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
      </section>
    </AppShell>
  );
}

function ProjectsPage({ projects, currentUser, onLogout }: { projects: Project[]; currentUser: AppUser; onLogout: () => void }) {
  return <AppShell title="Projets" description={`${projects.length} espaces de travail`} currentUser={currentUser} onLogout={onLogout}><div className="mb-6 flex justify-end"><Button render={<Link href="/projects/new" />}><Plus />Nouveau projet</Button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div></AppShell>;
}

function NewProjectPage({ currentUser, onLogout }: { currentUser: AppUser; onLogout: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ProjectValues>({ resolver: zodResolver(projectSchema), defaultValues: { title: "", description: "", category: "", client: "" } });
  const mutation = useMutation({
    mutationFn: async (values: ProjectValues) => {
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => body.append(key, value));
      files.forEach((file) => body.append("files", file));
      const response = await fetch("/api/projects", { method: "POST", body });
      if (!response.ok) throw new Error("La création a échoué");
      return response.json() as Promise<Project>;
    },
    onSuccess: (project) => {
      queryClient.setQueryData<Project[]>(["projects"], (current = []) => [project, ...current]);
      toast.success("Projet créé");
      router.push(`/projects/${project.id}`);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <AppShell title="Nouveau projet" description="Créez un espace et ajoutez vos premiers fichiers." currentUser={currentUser} onLogout={onLogout}>
      <div className="mx-auto max-w-3xl"><Button variant="ghost" render={<Link href="/projects" />} className="mb-4"><ArrowLeft />Retour</Button>
        <Card><CardHeader><CardTitle>Informations du projet</CardTitle><CardDescription>Vous pourrez modifier ces informations plus tard.</CardDescription></CardHeader><CardContent>
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-6">
            <div className="space-y-2"><Label>Nom du projet *</Label><Input placeholder="Ex. Refonte du site" {...register("title")} />{errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}</div>
            <div className="space-y-2"><Label>Description</Label><Textarea rows={4} placeholder="Décrivez l’objectif du projet…" {...register("description")} /></div>
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label>Catégorie</Label><Select onValueChange={(value) => setValue("category", String(value))}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent><SelectItem value="Design">Design</SelectItem><SelectItem value="Marketing">Marketing</SelectItem><SelectItem value="Application">Application</SelectItem><SelectItem value="Autre">Autre</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Client</Label><Input placeholder="Nom du client" {...register("client")} /></div></div>
            <div className="space-y-2"><Label>Importer des fichiers</Label><label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-slate-50 text-center transition hover:border-primary hover:bg-blue-50/50"><Upload className="mb-3 size-6 text-primary" /><span className="text-sm font-medium">Glissez vos fichiers ou cliquez ici</span><span className="mt-1 text-xs text-muted-foreground">{files.length ? `${files.length} fichier(s) sélectionné(s)` : "PDF, images, vidéos et archives"}</span><input type="file" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label></div>
            <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => router.back()}>Annuler</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Création…" : "Créer le projet"}</Button></div>
          </form>
        </CardContent></Card>
      </div>
    </AppShell>
  );
}

function FileIcon({ file }: { file: ProjectFile }) {
  if (["png", "jpg", "jpeg", "svg"].includes(file.extension)) return <ImageIcon className="size-5 text-violet-600" />;
  if (["mp4", "mov", "avi"].includes(file.extension)) return <Video className="size-5 text-rose-600" />;
  return <FileText className="size-5 text-blue-600" />;
}

function ProjectDetail({ project, currentUser, onLogout }: { project?: Project; currentUser: AppUser; onLogout: () => void }) {
  if (!project) return <AppShell title="Projet introuvable" currentUser={currentUser} onLogout={onLogout}><Card><CardContent className="p-10 text-center"><FolderOpen className="mx-auto mb-3 size-10 text-muted-foreground" /><p>Ce projet n’existe pas ou vous n’y avez pas accès.</p><Button render={<Link href="/projects" />} className="mt-5">Voir les projets</Button></CardContent></Card></AppShell>;
  return (
    <AppShell title={project.title} description={`${project.category ?? "Projet"} · ${project.client ?? "Client interne"}`} currentUser={currentUser} onLogout={onLogout}>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><Button variant="ghost" size="sm" render={<Link href="/projects" />} className="-ml-3 mb-2"><ArrowLeft />Tous les projets</Button><p className="max-w-2xl text-sm leading-6 text-muted-foreground">{project.description}</p><p className="mt-3 text-xs text-muted-foreground">Créé par <b className="text-foreground">{project.creatorName}</b> · {formatDate(project.createdAt, { dateStyle: "long" })}</p></div><Button><Upload />Ajouter des fichiers</Button></div>
      <Card><CardHeader><CardTitle className="text-lg">Fichiers</CardTitle><CardDescription>{project.files.length} élément(s) dans ce projet</CardDescription></CardHeader><CardContent>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">{["Assets", "Images", "Vidéos"].map((folder) => <div key={folder} className="flex items-center gap-3 rounded-lg border bg-slate-50 p-3"><FolderOpen className="size-5 text-amber-500" /><span className="text-sm font-medium">{folder}</span><ChevronRight className="ml-auto size-4 text-muted-foreground" /></div>)}</div>
        <div className="divide-y rounded-lg border">{project.files.length ? project.files.map((file) => <div key={file.id} className="flex items-center gap-3 p-4"><div className="grid size-10 place-items-center rounded-lg bg-slate-100"><FileIcon file={file} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.originalName}</p><p className="text-xs text-muted-foreground">{formatBytes(file.size)} · {formatDate(file.createdAt)}</p></div><Button variant="ghost" size="icon" render={file.url !== "#" ? <a href={file.url} target="_blank" rel="noreferrer" /> : undefined}><Download className="size-4" /></Button><Button variant="ghost" size="icon"><Trash2 className="size-4 text-muted-foreground" /></Button></div>) : <div className="p-10 text-center text-sm text-muted-foreground">Aucun fichier pour le moment.</div>}</div>
      </CardContent></Card>
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

function UsersPage({ currentUser, onLogout }: { currentUser: AppUser; onLogout: () => void }) {
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

  const roleStyle: Record<Role, string> = { admin: "bg-violet-100 text-violet-700", manager: "bg-blue-100 text-blue-700", user: "bg-slate-100 text-slate-700" };

  return (
    <AppShell title="Utilisateurs" description="Gérez les membres et leurs droits d’accès." currentUser={currentUser} onLogout={onLogout}>
      {currentUser.role === "admin" && (
        <div className="mb-5 flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button><Plus />Créer un utilisateur</Button>} />
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
                <Button type="submit" className="w-full" disabled={mutation.isPending}>{mutation.isPending ? "Création…" : "Créer l’utilisateur"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <Card><CardContent className="p-0">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div> : (
          <div className="divide-y">{users.map((user) => (
            <div key={user.id} className="flex items-center gap-4 p-4 md:px-6">
              <Avatar><AvatarFallback>{initials(user)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.firstname} {user.lastname}{user.id === currentUser.id ? " (vous)" : ""}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Badge className={roleStyle[user.role]}>{roleLabel(user.role)}</Badge>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
    </AppShell>
  );
}

function ProfilePage({ currentUser, onLogout }: { currentUser: AppUser; onLogout: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { firstname: currentUser.firstname, lastname: currentUser.lastname },
  });
  const mutation = useMutation({
    mutationFn: async (values: { firstname: string; lastname: string }) => {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Mise à jour impossible");
      return body as AppUser;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["me"], user);
      toast.success("Profil mis à jour");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell title="Mon profil" description="Gérez vos informations personnelles." currentUser={currentUser} onLogout={onLogout}>
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Informations personnelles</CardTitle><CardDescription>Rôle : {roleLabel(currentUser.role)}</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2"><Label>Prénom</Label><Input {...register("firstname", { required: true })} />{errors.firstname && <p className="text-xs text-destructive">Prénom requis</p>}</div>
              <div className="space-y-2"><Label>Nom</Label><Input {...register("lastname", { required: true })} />{errors.lastname && <p className="text-xs text-destructive">Nom requis</p>}</div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input value={currentUser.email} disabled /></div>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button>
          </form>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function SettingsPage({ currentUser, onLogout }: { currentUser: AppUser; onLogout: () => void }) {
  return (
    <AppShell title="Paramètres" description="Configurez votre espace ProjectHub." currentUser={currentUser} onLogout={onLogout}>
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
    enabled: route !== "login",
    retry: false,
  });
  const { data: projects = [], isLoading: projectsLoading, isError: projectsError } = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
    enabled: route !== "login" && !!currentUser,
    retry: 1,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    enabled: route !== "login" && !!currentUser && currentUser.role !== "user",
    retry: 1,
  });
  const project = useMemo(
    () => (route.startsWith("projects/") ? projects.find((item) => item.id === slug[1]) : undefined),
    [projects, route, slug],
  );

  useEffect(() => {
    if (route === "login") return;
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

  if (userLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="text-center">
          <FolderOpen className="mx-auto mb-3 size-8 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">Chargement de votre espace…</p>
        </div>
      </div>
    );
  }

  if (userError || !currentUser) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <FolderOpen className="mx-auto mb-3 size-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            {userQueryError?.message === "SESSION_EXPIRED"
              ? "Session expirée. Redirection vers la connexion…"
              : "Impossible de charger votre profil. Vérifiez la configuration Firebase sur Vercel."}
          </p>
          <Button className="mt-4" render={<Link href="/login" />}>
            Se connecter
          </Button>
        </div>
      </div>
    );
  }

  if (projectsLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="text-center">
          <FolderOpen className="mx-auto mb-3 size-8 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">Chargement des projets…</p>
        </div>
      </div>
    );
  }

  if (route === "dashboard") return <Dashboard projects={projects} currentUser={currentUser} usersCount={currentUser.role === "user" ? undefined : users.length} onLogout={handleLogout} />;
  if (route === "projects") return <ProjectsPage projects={projects} currentUser={currentUser} onLogout={handleLogout} />;
  if (route === "projects/new") return <NewProjectPage currentUser={currentUser} onLogout={handleLogout} />;
  if (route.startsWith("projects/")) return <ProjectDetail project={project} currentUser={currentUser} onLogout={handleLogout} />;
  if (route === "users") return currentUser.role === "user" ? <Dashboard projects={projects} currentUser={currentUser} onLogout={handleLogout} /> : <UsersPage currentUser={currentUser} onLogout={handleLogout} />;
  if (route === "profile") return <ProfilePage currentUser={currentUser} onLogout={handleLogout} />;
  if (route === "settings") return <SettingsPage currentUser={currentUser} onLogout={handleLogout} />;
  return <Dashboard projects={projects} currentUser={currentUser} usersCount={currentUser.role === "user" ? undefined : users.length} onLogout={handleLogout} />;
}
