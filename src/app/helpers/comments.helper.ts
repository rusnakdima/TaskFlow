export class CommentsHelper {
  static countUnreadComments(
    entity: { tasks?: any[]; comments?: any[] },
    userId: string,
    countSubtaskComments: boolean = false
  ): number {
    if (!userId) return 0;

    const tasks = entity.tasks || [];
    let count = 0;

    for (const task of tasks) {
      const comments = task.comments || [];
      for (const c of comments) {
        if (c.deleted_at) continue;
        if (c.author_id === userId) continue;
        if (c.read_by && c.read_by.includes(userId)) continue;
        if (!countSubtaskComments && !c.subtask_id) continue;
        if (countSubtaskComments && c.subtask_id) continue;
        count++;
      }
    }
    return count;
  }

  static countUnreadCommentsForEntity(
    entity: { comments?: any[] },
    userId: string | null,
    entityType: "task" | "subtask" = "task"
  ): number {
    if (!entity || !userId) return 0;

    let count = 0;

    if (entity.comments && entity.comments.length > 0) {
      count = entity.comments.filter((c: any) => {
        if (c.deleted_at) return false;
        if (c.author_id === userId) return false;
        if (c.read_by && c.read_by.includes(userId)) return false;
        if (entityType === "task" && c.subtask_id) return false;
        if (entityType === "subtask" && !c.subtask_id) return false;
        return true;
      }).length;
    }

    return count;
  }

  static markCommentsAsRead(
    entity: { comments?: any[] },
    userId: string,
    entityType: "task" | "subtask" = "task"
  ): any[] {
    if (!entity || !entity.comments || !userId) return entity.comments || [];
    if (entity.comments.length === 0) return entity.comments;

    return entity.comments.map((comment: any) => {
      if (comment.deleted_at) return comment;

      if (entityType === "task" && comment.subtask_id) return comment;
      if (entityType === "subtask" && !comment.subtask_id) return comment;

      if (!comment.read_by || !comment.read_by.includes(userId)) {
        return {
          ...comment,
          readBy: [...(comment.read_by || []), userId],
        };
      }
      return comment;
    });
  }
}
