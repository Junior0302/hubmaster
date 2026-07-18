"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Search, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { AppUser, Conversation, Friendship } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type FriendsPayload = {
  friendships: Friendship[];
  pendingIncoming: Friendship[];
  pendingOutgoing: Friendship[];
};

async function getDirectory(): Promise<AppUser[]> {
  const response = await fetch("/api/users?directory=1", { cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de charger l’annuaire");
  return response.json();
}

async function getFriends(): Promise<FriendsPayload> {
  const response = await fetch("/api/friends", { cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de charger les amis");
  return response.json();
}

function initials(user: Pick<AppUser, "firstname" | "lastname">) {
  return `${user.firstname?.[0] ?? ""}${user.lastname?.[0] ?? ""}`.toUpperCase() || "?";
}

function MiniAvatar({ user }: { user: AppUser }) {
  return (
    <Avatar className="size-10">
      {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
      <AvatarFallback>{initials(user)}</AvatarFallback>
    </Avatar>
  );
}

export function NetworkContent({ currentUser }: { currentUser: AppUser }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"directory" | "friends" | "requests">("directory");

  const { data: directory = [], isLoading: dirLoading } = useQuery({
    queryKey: ["directory"],
    queryFn: getDirectory,
  });
  const { data: friendsData, isLoading: friendsLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: getFriends,
    refetchInterval: 8000,
  });

  const friendIds = useMemo(() => {
    const set = new Set<string>();
    friendsData?.friendships.forEach((f) => {
      const other = f.requesterId === currentUser.id ? f.addresseeId : f.requesterId;
      set.add(other);
    });
    friendsData?.pendingOutgoing.forEach((f) => set.add(f.addresseeId));
    friendsData?.pendingIncoming.forEach((f) => set.add(f.requesterId));
    return set;
  }, [friendsData, currentUser.id]);

  const outgoingByUser = useMemo(() => {
    const map = new Map<string, string>();
    friendsData?.pendingOutgoing.forEach((f) => map.set(f.addresseeId, f.id));
    return map;
  }, [friendsData]);

  const friendRelByUser = useMemo(() => {
    const map = new Map<string, string>();
    friendsData?.friendships.forEach((f) => {
      const other = f.requesterId === currentUser.id ? f.addresseeId : f.requesterId;
      map.set(other, f.id);
    });
    return map;
  }, [friendsData, currentUser.id]);

  const visibleDirectory = directory.filter((user) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      user.firstname.toLowerCase().includes(q) ||
      user.lastname.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q)
    );
  });

  const requestMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error ?? "Demande impossible"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      toast.success("Demande envoyée");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const response = await fetch(`/api/friends/${id}`, {
        method: action === "remove" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "remove" ? undefined : JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error ?? "Action impossible"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      toast.success("Mis à jour");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const chatMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error ?? "Conversation impossible"));
      return body as { id: string };
    },
    onSuccess: (data) => router.push(`/messages/${data.id}`),
    onError: (error: Error) => toast.error(error.message),
  });

  const pendingCount = friendsData?.pendingIncoming.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["directory", "Annuaire"],
            ["friends", "Mes amis"],
            ["requests", `Demandes${pendingCount ? ` (${pendingCount})` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "directory" && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Annuaire</CardTitle>
            <CardDescription>Ajoutez des personnes présentes sur la plateforme (les admins restent invisibles).</CardDescription>
            <div className="relative pt-2">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un membre…"
                className="rounded-xl pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dirLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)
            ) : visibleDirectory.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Aucun membre trouvé.</p>
            ) : (
              visibleDirectory.map((user) => {
                const isFriend = friendRelByUser.has(user.id);
                const pendingOut = outgoingByUser.has(user.id);
                return (
                  <div key={user.id} className="flex flex-col gap-3 rounded-2xl border bg-slate-50/70 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <MiniAvatar user={user} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {user.firstname} {user.lastname}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email || "Membre Hubmaster"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isFriend ? (
                        <>
                          <Badge variant="secondary">Ami</Badge>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => chatMutation.mutate(user.id)}
                          >
                            <MessageCircle className="size-4" /> Message
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="rounded-xl text-destructive"
                            onClick={() =>
                              actionMutation.mutate({ id: friendRelByUser.get(user.id)!, action: "remove" })
                            }
                          >
                            <UserMinus className="size-4" /> Retirer
                          </Button>
                        </>
                      ) : pendingOut ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-xl"
                          onClick={() =>
                            actionMutation.mutate({ id: outgoingByUser.get(user.id)!, action: "cancel" })
                          }
                        >
                          Annuler la demande
                        </Button>
                      ) : friendIds.has(user.id) ? (
                        <Badge variant="outline">Demande reçue</Badge>
                      ) : (
                        <Button
                          type="button"
                          className="rounded-xl"
                          disabled={requestMutation.isPending}
                          onClick={() => requestMutation.mutate(user.id)}
                        >
                          <UserPlus className="size-4" /> Ajouter
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {tab === "friends" && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Mes amis</CardTitle>
            <CardDescription>Discutez ou retirez un contact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {friendsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)
            ) : !friendsData?.friendships.length ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Pas encore d’amis. Explorez l’annuaire pour en ajouter.
              </p>
            ) : (
              friendsData.friendships.map((f) => {
                const user = f.otherUser;
                if (!user) return null;
                return (
                  <div key={f.id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <MiniAvatar user={user} />
                      <p className="truncate text-sm font-semibold">
                        {user.firstname} {user.lastname}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" className="rounded-xl" onClick={() => chatMutation.mutate(user.id)}>
                        <MessageCircle className="size-4" /> Message
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => actionMutation.mutate({ id: f.id, action: "remove" })}
                      >
                        Retirer
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {tab === "requests" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Reçues</CardTitle>
              <CardDescription>Acceptez ou refusez les invitations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!friendsData?.pendingIncoming.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucune demande reçue.</p>
              ) : (
                friendsData.pendingIncoming.map((f) => {
                  const user = f.otherUser;
                  if (!user) return null;
                  return (
                    <div key={f.id} className="flex items-center gap-3 rounded-2xl border p-3">
                      <MiniAvatar user={user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {user.firstname} {user.lastname}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        className="rounded-xl"
                        onClick={() => actionMutation.mutate({ id: f.id, action: "accept" })}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => actionMutation.mutate({ id: f.id, action: "decline" })}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Envoyées</CardTitle>
              <CardDescription>Demandes en attente de réponse.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!friendsData?.pendingOutgoing.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Aucune demande envoyée.</p>
              ) : (
                friendsData.pendingOutgoing.map((f) => {
                  const user = f.otherUser;
                  if (!user) return null;
                  return (
                    <div key={f.id} className="flex items-center gap-3 rounded-2xl border p-3">
                      <MiniAvatar user={user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {user.firstname} {user.lastname}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => actionMutation.mutate({ id: f.id, action: "cancel" })}
                      >
                        Annuler
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function MessagesContent({
  currentUser,
  conversationId,
}: {
  currentUser: AppUser;
  conversationId?: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [text, setText] = useState("");

  const { data: conversations = [], isLoading: listLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      if (!response.ok) throw new Error("Impossible de charger les conversations");
      return response.json() as Promise<Conversation[]>;
    },
    refetchInterval: 5000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" });
      if (!response.ok) throw new Error("Impossible de charger les messages");
      return response.json();
    },
    enabled: Boolean(conversationId),
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (conversationId) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  }, [conversationId, messages.length, queryClient]);

  const active = conversations.find((c) => c.id === conversationId);

  const sendMutation = useMutation({
    mutationFn: async (value: string) => {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error ?? "Envoi impossible"));
      return body;
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Conversations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3">
          {listLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
          ) : conversations.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Aucune discussion. Ajoutez un ami puis ouvrez un message.
            </p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`/messages/${c.id}`)}
                className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${
                  c.id === conversationId ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                {c.otherUser ? <MiniAvatar user={c.otherUser} /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {c.otherUser ? `${c.otherUser.firstname} ${c.otherUser.lastname}` : "Discussion"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{c.lastMessage || "Nouveau fil"}</p>
                </div>
                {(c.unreadCount ?? 0) > 0 && <Badge className="rounded-full">{c.unreadCount}</Badge>}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-[28rem] flex-col shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-base">
            {active?.otherUser
              ? `${active.otherUser.firstname} ${active.otherUser.lastname}`
              : conversationId
                ? "Discussion"
                : "Sélectionnez une conversation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          {!conversationId ? (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
              Choisissez une conversation ou démarrez-en une depuis Réseau.
            </div>
          ) : messagesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-2/3 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Dites bonjour pour commencer.</p>
              ) : (
                messages.map((m: { id: string; senderId: string; text: string; createdAt: string }) => {
                  const mine = m.senderId === currentUser.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          mine ? "bg-primary text-primary-foreground" : "bg-white border"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {conversationId ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const value = text.trim();
                if (!value) return;
                sendMutation.mutate(value);
              }}
            >
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Écrire un message…"
                className="rounded-xl"
                maxLength={2000}
              />
              <Button type="submit" className="rounded-xl" disabled={sendMutation.isPending || !text.trim()}>
                Envoyer
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
