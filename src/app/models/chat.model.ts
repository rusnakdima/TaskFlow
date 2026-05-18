export interface ConversationItem {
  roomId: string;
  name: string;
  avatar: string | null;
  isOnline: boolean;
  isTyping: boolean;
  isGroup: boolean;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  memberIds: string[];
  memberCount: number;
  bio: string;
  otherUserId?: string;
  ownerId?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  time: string;
  isMine: boolean;
}

export type FilterType = "all" | "unread" | "groups";

export type EmojiTab = "recent" | "smileys" | "gestures" | "objects";

export interface MemberItem {
  id: string;
  name: string;
  avatar?: string;
}
