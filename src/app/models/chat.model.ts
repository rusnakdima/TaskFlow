export interface ConversationItem {
  roomId: string;
  name: string;
  avatar: string | null;
  otherUserAvatar?: string | null;
  isOnline: boolean;
  isTyping: boolean;
  isGroup: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  memberIds: string[];
  memberCount: number;
  bio: string;
  otherUserId?: string;
  ownerId?: string;
  isLocal?: boolean;
}

export interface Reaction {
  emoji: string;
  count: number;
  isOwn: boolean;
  user_ids?: string[];
}

export interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  time: string;
  isMine: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  readStatus?: "sent" | "delivered" | "read";
  reactions?: Reaction[];
  replyTo?: ChatMessage | null;
  replyId?: string | null;
  syncStatus?: "pending" | "synced" | "failed";
  tempId?: string;
  retryCount?: number;
  lastError?: string;
  sender?: {
    id?: string;
    email?: string;
    username?: string;
    role?: string;
    profile_id?: string;
    profile?: {
      id?: string;
      name?: string;
      last_name?: string;
      bio?: string;
      image_url?: string;
      user_id?: string;
    };
  };
}

export type FilterType = "all" | "unread" | "groups";

export type EmojiTab = "recent" | "smileys" | "gestures" | "objects";

export interface MemberItem {
  id: string;
  name: string;
  avatar?: string;
}
