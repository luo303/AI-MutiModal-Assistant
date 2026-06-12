import { Session } from "../types/session.js";

/**
 * 内存会话存储 —— MVP 阶段不使用数据库
 */
class SessionStore {
  private sessions = new Map<string, Session>();

  create(session: Session): Session {
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getOrThrow(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    return session;
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  getAll(): Session[] {
    return [...this.sessions.values()];
  }

  /** 清理已关闭的会话 */
  cleanup(): void {
    for (const [id, session] of this.sessions) {
      if (session.state === "closed") {
        this.sessions.delete(id);
      }
    }
  }
}

export const sessionStore = new SessionStore();
