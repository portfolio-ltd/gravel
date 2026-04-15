"""
Seed script: creates demo users + 2 sample projects with tasks & changelog.
Run: python seed.py (from apps/api directory)
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from db.session import AsyncSessionLocal, engine
from db.base import Base
import models  # noqa
from models.user import User, UserRole
from models.project import Project, ProjectStatus
from models.task import Task, TaskStatus, TaskPriority, TaskType
from models.changelog import ChangelogEntry, ChangelogType
from services.auth import hash_password

DEMO_PASSWORD = "demo1234"

SEED_USERS = [
    {"name": "Alex Rivera",   "email": "admin@gravel.dev",  "role": UserRole.admin,     "password": DEMO_PASSWORD},
    {"name": "Sam Chen",      "email": "dev@gravel.dev",    "role": UserRole.developer,  "password": DEMO_PASSWORD},
    {"name": "Jordan Lee",    "email": "qa@gravel.dev",     "role": UserRole.qa,         "password": DEMO_PASSWORD},
    {"name": "Taylor Kim",    "email": "pm@gravel.dev",     "role": UserRole.product,    "password": DEMO_PASSWORD},
    {"name": "Morgan Patel",  "email": "devops@gravel.dev", "role": UserRole.devops,     "password": DEMO_PASSWORD},
]


async def seed():
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select

        # ── Users ───────────────────────────────────────────────────────────
        created_users: dict[str, User] = {}
        for u_data in SEED_USERS:
            result = await db.execute(select(User).where(User.email == u_data["email"]))
            existing = result.scalar_one_or_none()
            if existing:
                created_users[u_data["email"]] = existing
                print(f"  user already exists: {u_data['email']}")
                continue
            user = User(
                name=u_data["name"],
                email=u_data["email"],
                hashed_password=hash_password(u_data["password"]),
                role=u_data["role"],
            )
            db.add(user)
            await db.flush()
            created_users[u_data["email"]] = user
            print(f"  created user: {u_data['email']}")

        admin = created_users["admin@gravel.dev"]

        # ── Project 1: Customer Dashboard v2 ──────────────────────────────
        result = await db.execute(select(Project).where(Project.name == "Customer Dashboard v2"))
        if not result.scalar_one_or_none():
            p1 = Project(name="Customer Dashboard v2", status=ProjectStatus.review, progress=72, owner_id=admin.id)
            db.add(p1)
            await db.flush()

            tasks1 = [
                Task(project_id=p1.id, title="Setup authentication with JWT", description="Implement login, logout, refresh token flow", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.feature, position=0),
                Task(project_id=p1.id, title="Design system component library", description="Create base button, input, card, modal components", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.design, position=1),
                Task(project_id=p1.id, title="Dashboard layout & navigation", description="Responsive sidebar + top nav + main content area", status=TaskStatus.qa, priority=TaskPriority.high, type=TaskType.feature, position=2),
                Task(project_id=p1.id, title="User profile management", description="Edit profile, avatar upload, password change", status=TaskStatus.in_progress, priority=TaskPriority.medium, type=TaskType.feature, position=3),
                Task(project_id=p1.id, title="Notification system", description="In-app toasts + email triggers via webhook", status=TaskStatus.pending, priority=TaskPriority.medium, type=TaskType.feature, position=4),
                Task(project_id=p1.id, title="Database schema & migrations", description="Users, sessions, projects, tasks tables", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.infra, position=5),
            ]
            for t in tasks1:
                db.add(t)

            changelog1 = [
                ChangelogEntry(project_id=p1.id, message="Add JWT authentication middleware and refresh token rotation", type=ChangelogType.added, file_path="src/auth/jwt.ts"),
                ChangelogEntry(project_id=p1.id, message="Create responsive Dashboard layout with collapsible sidebar", type=ChangelogType.added, file_path="src/pages/Dashboard.tsx"),
                ChangelogEntry(project_id=p1.id, message="Fix token expiry race condition on concurrent requests", type=ChangelogType.fixed, file_path="src/auth/middleware.ts"),
                ChangelogEntry(project_id=p1.id, message="Database migrations for users and sessions tables", type=ChangelogType.infra, file_path="db/migrations/001_init.sql"),
                ChangelogEntry(project_id=p1.id, message="Design system: Button, Card, Badge, Input, Dialog components", type=ChangelogType.added, file_path="src/components/ui/"),
            ]
            for c in changelog1:
                db.add(c)
            print("  created project: Customer Dashboard v2")

        # ── Project 2: Mobile Auth Redesign ───────────────────────────────
        result = await db.execute(select(Project).where(Project.name == "Mobile Auth Redesign"))
        if not result.scalar_one_or_none():
            p2 = Project(name="Mobile Auth Redesign", status=ProjectStatus.running, progress=38, owner_id=admin.id)
            db.add(p2)
            await db.flush()

            tasks2 = [
                Task(project_id=p2.id, title="Setup authentication with JWT", description="Implement login, logout, refresh token flow", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.feature, position=0),
                Task(project_id=p2.id, title="Design system component library", description="Create base button, input, card, modal components", status=TaskStatus.done, priority=TaskPriority.high, type=TaskType.design, position=1),
                Task(project_id=p2.id, title="Dashboard layout & navigation", description="Responsive sidebar + top nav", status=TaskStatus.in_progress, priority=TaskPriority.high, type=TaskType.feature, position=2),
                Task(project_id=p2.id, title="User profile management", description="Edit profile, avatar upload", status=TaskStatus.pending, priority=TaskPriority.medium, type=TaskType.feature, position=3),
            ]
            for t in tasks2:
                db.add(t)

            changelog2 = [
                ChangelogEntry(project_id=p2.id, message="Add JWT authentication middleware", type=ChangelogType.added, file_path="src/auth/jwt.ts"),
                ChangelogEntry(project_id=p2.id, message="Create responsive Dashboard layout", type=ChangelogType.added, file_path="src/pages/Dashboard.tsx"),
            ]
            for c in changelog2:
                db.add(c)
            print("  created project: Mobile Auth Redesign")

        await db.commit()
        print("\nSeed complete! Demo credentials:")
        print(f"  email: admin@gravel.dev   password: {DEMO_PASSWORD}")
        print(f"  email: dev@gravel.dev     password: {DEMO_PASSWORD}")
        print(f"  email: qa@gravel.dev      password: {DEMO_PASSWORD}")
        print(f"  email: pm@gravel.dev      password: {DEMO_PASSWORD}")
        print(f"  email: devops@gravel.dev  password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
