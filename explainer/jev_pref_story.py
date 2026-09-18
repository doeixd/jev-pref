from manim import *

# ============================================================
# jev-pref explainer
# Manim Community Edition
#
# Render:
#   manim -pqh jev_pref_story.py JevPrefStory
#
# Design goals:
# - One continuous visual world
# - Developer-oriented, not "AI promo"
# - Code editor is the main stage
# - Architecture is revealed through a concrete bug
# ============================================================


BG = "#0B0D10"
PANEL = "#14181D"
PANEL_2 = "#1A2026"
BORDER = "#303841"
TEXT = "#F2F4F5"
MUTED = "#9AA4AE"
DIM = "#65707A"
ACCENT = "#D7E3EA"

GREEN = "#7EC699"
YELLOW = "#E6C07B"
RED = "#E06C75"
BLUE = "#61AFEF"

MONO = "Cascadia Mono"
SANS = "Segoe UI"


class JevPrefStory(Scene):
    def construct(self):
        self.camera.background_color = BG

        # ----------------------------------------------------
        # 1. Start inside the agent workflow
        # ----------------------------------------------------
        editor = self.make_editor()
        self.play(FadeIn(editor, shift=0.15 * UP), run_time=0.9)

        agent_tag = self.pill("coding agent", BLUE)
        agent_tag.scale(0.72).next_to(editor, UP, buff=0.18).align_to(editor, RIGHT)
        self.play(FadeIn(agent_tag, shift=0.1 * DOWN), run_time=0.4)

        code_before = self.code_block(
            [
                ("import { Surface } from './surface'", MUTED),
                ("", TEXT),
                ("export const transport = Surface.make({", TEXT),
                ("  send: request => fetch(request)", TEXT),
                ("})", TEXT),
            ],
            width=7.4,
            font_size=27,
        )
        code_before.move_to(editor.get_center() + 0.05 * DOWN)

        self.play(FadeIn(code_before, shift=0.1 * RIGHT), run_time=0.6)
        self.wait(0.4)

        # Agent adds a parallel abstraction
        code_after = self.code_block(
            [
                ("import { Surface } from './surface'", MUTED),
                ("", TEXT),
                ("export interface TransportSurface {", YELLOW),
                ("  send(request: Request): Promise<Response>", YELLOW),
                ("}", YELLOW),
                ("", TEXT),
                ("export const transport: TransportSurface = {", YELLOW),
                ("  send: request => fetch(request)", TEXT),
                ("}", TEXT),
            ],
            width=7.4,
            font_size=25,
        )
        code_after.move_to(code_before)

        added_label = self.pill("+ new abstraction", YELLOW)
        added_label.scale(0.65).next_to(editor, RIGHT, buff=0.22).shift(0.4 * UP)

        self.play(
            FadeTransform(code_before, code_after),
            FadeIn(added_label, shift=0.1 * LEFT),
            run_time=1.0,
        )
        self.wait(0.4)

        # ----------------------------------------------------
        # 2. Conventional tools all pass
        # ----------------------------------------------------
        status_title = Text(
            "normal checks", font=SANS, color=MUTED, font_size=24
        ).next_to(editor, DOWN, buff=0.35).align_to(editor, LEFT)

        checks = VGroup(
            self.check_row("TypeScript", "types", GREEN),
            self.check_row("ESLint", "static rules", GREEN),
            self.check_row("tests", "behavior", GREEN),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.12)
        checks.next_to(status_title, DOWN, buff=0.15).align_to(status_title, LEFT)

        self.play(FadeIn(status_title))
        for row in checks:
            self.play(FadeIn(row, shift=0.12 * RIGHT), run_time=0.35)
        self.wait(0.6)

        # ----------------------------------------------------
        # 3. Reveal the problem
        # ----------------------------------------------------
        # Highlight the old "Surface" word and the new TransportSurface
        # block, anchored to the actual laid-out text (font-metric safe).
        old_surface = SurroundingRectangle(
            code_after[0][9:16],
            buff=0.07,
            corner_radius=0.08,
            color=BLUE,
            stroke_width=2,
        )

        new_surface = SurroundingRectangle(
            code_after[2:5],
            buff=0.10,
            corner_radius=0.08,
            color=YELLOW,
            stroke_width=2.5,
        )

        self.play(Create(old_surface), Create(new_surface), run_time=0.7)

        question = Text(
            "…but the architecture is still wrong.",
            font=SANS,
            weight=BOLD,
            color=TEXT,
            font_size=34,
        )
        question.to_edge(RIGHT, buff=0.55).shift(0.8 * DOWN)

        subquestion = Text(
            "How do you lint that?",
            font=SANS,
            color=ACCENT,
            font_size=30,
        ).next_to(question, DOWN, buff=0.24).align_to(question, LEFT)

        self.play(
            FadeIn(question, shift=0.1 * UP),
            FadeIn(subquestion, shift=0.1 * UP),
            run_time=0.7,
        )
        self.wait(0.9)

        # ----------------------------------------------------
        # 4. Introduce jev-pref as the missing semantic layer
        # ----------------------------------------------------
        semantic_row = self.check_row("jev-pref", "semantic project rules", YELLOW)
        semantic_row.next_to(checks, DOWN, buff=0.18).align_to(checks, LEFT)

        self.play(
            FadeOut(question),
            FadeOut(subquestion),
            FadeIn(semantic_row, shift=0.14 * RIGHT),
            run_time=0.7,
        )
        self.play(Circumscribe(semantic_row, color=YELLOW, buff=0.08), run_time=0.8)
        self.wait(0.4)

        # ----------------------------------------------------
        # 5. Show policy -> concrete question
        # ----------------------------------------------------
        policy_panel = self.panel(5.15, 3.7, "PROJECT POLICY")
        policy_panel.to_edge(RIGHT, buff=0.42).shift(0.25 * UP)

        policy_text = VGroup(
            Text(
                "AGENTS.md",
                font=MONO,
                color=ACCENT,
                font_size=24,
            ),
            Text(
                "Public primitives should compose",
                font=MONO,
                color=TEXT,
                font_size=20,
            ),
            Text(
                "through Surface rather than create",
                font=MONO,
                color=TEXT,
                font_size=20,
            ),
            Text(
                "parallel representations.",
                font=MONO,
                color=TEXT,
                font_size=20,
            ),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.10)
        policy_text.move_to(policy_panel.get_center()).shift(0.18 * DOWN)

        # Clear right-side temporary label before policy comes in
        self.play(
            FadeOut(added_label),
            FadeOut(old_surface),
            FadeOut(new_surface),
            FadeIn(policy_panel),
            FadeIn(policy_text, shift=0.1 * LEFT),
            run_time=0.8,
        )
        self.wait(0.5)

        bridge = Arrow(
            policy_panel.get_bottom() + 0.55 * LEFT,
            editor.get_right() + 0.1 * RIGHT + 0.45 * DOWN,
            buff=0.12,
            color=MUTED,
            stroke_width=2.4,
            max_tip_length_to_length_ratio=0.08,
        )

        concrete_q = self.small_callout(
            "Does this change introduce another representation\n"
            "of a concept already represented by Surface?",
            width=5.2,
            color=YELLOW,
        )
        concrete_q.next_to(policy_panel, DOWN, buff=0.22)

        self.play(Create(bridge), FadeIn(concrete_q, shift=0.12 * UP), run_time=0.8)
        self.wait(0.7)

        # Replace long policy visuals with a compact rule chip
        rule_chip = self.pill("rule: no parallel Surface abstraction", YELLOW)
        rule_chip.scale(0.68)
        rule_chip.next_to(editor, UP, buff=0.20).align_to(editor, LEFT)

        self.play(
            FadeOut(policy_panel),
            FadeOut(policy_text),
            FadeOut(bridge),
            Transform(concrete_q, rule_chip),
            run_time=0.8,
        )

        # ----------------------------------------------------
        # 6. Run jev-pref review
        # ----------------------------------------------------
        terminal = self.panel(7.7, 1.22, "TERMINAL")
        terminal.next_to(editor, DOWN, buff=0.32).align_to(editor, LEFT)

        cmd = Text(
            "$ npx jev-pref review --hunks",
            font=MONO,
            color=TEXT,
            font_size=25,
        )
        cmd.move_to(terminal.get_center()).shift(0.08 * DOWN)

        self.play(
            FadeOut(status_title),
            FadeOut(checks),
            FadeOut(semantic_row),
            FadeIn(terminal, shift=0.1 * UP),
            Write(cmd),
            run_time=0.9,
        )
        self.wait(0.4)

        # ----------------------------------------------------
        # 7. Diff flows to Jev
        # ----------------------------------------------------
        jev_box = self.labeled_box("Jev", "classify evidence", BLUE, 2.5, 1.25)
        jev_box.to_edge(RIGHT, buff=1.1).shift(1.15 * UP)

        policy_box = self.labeled_box("jev-pref", "apply policy", YELLOW, 2.7, 1.25)
        policy_box.next_to(jev_box, DOWN, buff=0.55)

        diff_arrow = Arrow(
            editor.get_right(),
            jev_box.get_left(),
            buff=0.18,
            color=MUTED,
            stroke_width=3,
        )
        diff_label = Text(
            "visible diff",
            font=SANS,
            color=MUTED,
            font_size=20,
        ).next_to(diff_arrow, UP, buff=0.07)

        self.play(
            FadeIn(jev_box, shift=0.1 * LEFT),
            Create(diff_arrow),
            FadeIn(diff_label),
            run_time=0.7,
        )

        prob = Text(
            "P = 0.91",
            font=MONO,
            weight=BOLD,
            color=YELLOW,
            font_size=31,
        )
        prob.next_to(jev_box, DOWN, buff=0.14)

        self.play(FadeIn(prob, shift=0.1 * DOWN), run_time=0.5)

        policy_arrow = Arrow(
            prob.get_bottom(),
            policy_box.get_top(),
            buff=0.12,
            color=MUTED,
            stroke_width=2.8,
        )

        threshold = Text(
            "0.91 > cutoff 0.70",
            font=MONO,
            color=MUTED,
            font_size=18,
        )
        threshold.next_to(policy_box, DOWN, buff=0.12)

        self.play(
            FadeIn(policy_box, shift=0.1 * UP),
            Create(policy_arrow),
            FadeIn(threshold),
            run_time=0.7,
        )

        verdict = self.pill("ADVISORY", YELLOW)
        verdict.scale(0.85).next_to(threshold, DOWN, buff=0.18)
        self.play(FadeIn(verdict, scale=0.9), run_time=0.5)
        self.wait(0.5)

        # ----------------------------------------------------
        # 8. Diagnostic attaches to offending code
        # ----------------------------------------------------
        diagnostic = self.small_callout(
            "parallel abstraction\nP = 0.91",
            width=2.75,
            color=YELLOW,
        )
        diagnostic.next_to(editor, RIGHT, buff=0.16).shift(0.15 * UP)

        diag_arrow = Arrow(
            diagnostic.get_left(),
            editor.get_right() + 0.35 * UP,
            buff=0.08,
            color=YELLOW,
            stroke_width=2.5,
        )

        # Collapse architecture to make room for the linter feel
        self.play(
            FadeOut(jev_box),
            FadeOut(policy_box),
            FadeOut(diff_arrow),
            FadeOut(diff_label),
            FadeOut(prob),
            FadeOut(policy_arrow),
            FadeOut(threshold),
            FadeOut(verdict),
            FadeIn(diagnostic, shift=0.1 * LEFT),
            Create(diag_arrow),
            run_time=0.8,
        )
        self.wait(0.5)

        # ----------------------------------------------------
        # 9. Agent fixes the code
        # ----------------------------------------------------
        fixed_code = self.code_block(
            [
                ("import { Surface } from './surface'", MUTED),
                ("", TEXT),
                ("export const transport = Surface.make({", GREEN),
                ("  send: request => fetch(request)", TEXT),
                ("})", GREEN),
            ],
            width=7.4,
            font_size=27,
        )
        fixed_code.move_to(code_before)

        fixing = self.pill("agent fixes implementation", BLUE)
        fixing.scale(0.70).next_to(editor, RIGHT, buff=0.18).shift(0.25 * DOWN)

        self.play(
            FadeOut(diagnostic),
            FadeOut(diag_arrow),
            FadeIn(fixing, shift=0.1 * LEFT),
            Transform(code_before, fixed_code),
            run_time=1.0,
        )
        self.wait(0.4)

        # ----------------------------------------------------
        # 10. Review again -> approve
        # ----------------------------------------------------
        cmd2 = Text(
            "$ npx jev-pref review --hunks",
            font=MONO,
            color=TEXT,
            font_size=25,
        )
        cmd2.move_to(cmd)

        result2 = Text(
            "P = 0.08   →   APPROVE",
            font=MONO,
            weight=BOLD,
            color=GREEN,
            font_size=25,
        )
        result2.next_to(cmd2, DOWN, buff=0.16)

        # Expand terminal vertically just for rerun result
        terminal2 = self.panel(7.7, 1.72, "TERMINAL")
        terminal2.move_to(terminal.get_center() + 0.10 * DOWN)

        self.play(
            FadeOut(fixing),
            Transform(terminal, terminal2),
            Transform(cmd, cmd2),
            FadeIn(result2, shift=0.1 * UP),
            run_time=0.8,
        )
        self.play(Flash(result2, color=GREEN, flash_radius=0.55), run_time=0.7)
        self.wait(0.6)

        # ----------------------------------------------------
        # 11. Pull back to the complete tooling stack
        # ----------------------------------------------------
        self.play(
            FadeOut(editor),
            FadeOut(code_before),
            FadeOut(concrete_q),
            FadeOut(terminal),
            FadeOut(cmd),
            FadeOut(result2),
            FadeOut(agent_tag),
            run_time=0.8,
        )

        stack_title = Text(
            "Your project has more than one kind of invariant.",
            font=SANS,
            weight=BOLD,
            color=TEXT,
            font_size=34,
        ).to_edge(UP, buff=0.7)

        stack = VGroup(
            self.stack_row("TypeScript", "type invariants", GREEN),
            self.stack_row("ESLint", "syntax + static rules", GREEN),
            self.stack_row("tests", "behavioral invariants", GREEN),
            self.stack_row("jev-pref", "semantic project rules", YELLOW),
        ).arrange(DOWN, buff=0.22, aligned_edge=LEFT)
        stack.move_to(ORIGIN + 0.15 * UP)

        self.play(FadeIn(stack_title, shift=0.1 * DOWN), run_time=0.5)
        self.play(
            LaggedStart(*[FadeIn(r, shift=0.15 * RIGHT) for r in stack], lag_ratio=0.18),
            run_time=1.3,
        )
        self.play(Circumscribe(stack[-1], color=YELLOW, buff=0.08), run_time=0.8)
        self.wait(0.5)

        # ----------------------------------------------------
        # 12. Final CTA
        # ----------------------------------------------------
        self.play(
            FadeOut(stack_title),
            FadeOut(stack),
            run_time=0.6,
        )

        final_title = Text(
            "jev-pref",
            font=MONO,
            weight=BOLD,
            color=TEXT,
            font_size=56,
        )
        final_sub = Text(
            "Semantic linting for coding agents.",
            font=SANS,
            color=ACCENT,
            font_size=30,
        )
        final_cmd = Text(
            "$ npx jev-pref setup",
            font=MONO,
            color=GREEN,
            font_size=31,
        )

        final = VGroup(final_title, final_sub, final_cmd).arrange(DOWN, buff=0.34)
        final.move_to(ORIGIN)

        self.play(FadeIn(final_title, shift=0.1 * UP), run_time=0.5)
        self.play(FadeIn(final_sub, shift=0.1 * UP), run_time=0.5)
        self.play(Write(final_cmd), run_time=0.8)
        self.wait(2.0)

    # ========================================================
    # Helpers
    # ========================================================

    def panel(self, width, height, title=None):
        rect = RoundedRectangle(
            width=width,
            height=height,
            corner_radius=0.14,
            stroke_color=BORDER,
            stroke_width=1.5,
            fill_color=PANEL,
            fill_opacity=1,
        )

        if title is None:
            return rect

        title_text = Text(
            title,
            font=SANS,
            weight=BOLD,
            color=MUTED,
            font_size=16,
        )
        title_text.move_to(
            rect.get_top() + DOWN * 0.24 + RIGHT * (-width / 2 + 0.62)
        )

        return VGroup(rect, title_text)

    def make_editor(self):
        frame = RoundedRectangle(
            width=8.2,
            height=4.55,
            corner_radius=0.16,
            stroke_color=BORDER,
            stroke_width=1.6,
            fill_color=PANEL,
            fill_opacity=1,
        )
        frame.to_edge(LEFT, buff=0.55).shift(0.6 * UP)

        titlebar = Rectangle(
            width=8.0,
            height=0.48,
            stroke_width=0,
            fill_color=PANEL_2,
            fill_opacity=1,
        )
        titlebar.move_to(frame.get_top() + 0.28 * DOWN)

        filename = Text(
            "transport.ts",
            font=MONO,
            color=MUTED,
            font_size=18,
        )
        filename.move_to(titlebar.get_center()).align_to(titlebar, LEFT).shift(0.22 * RIGHT)

        dots = VGroup(
            Dot(radius=0.055, color=RED),
            Dot(radius=0.055, color=YELLOW),
            Dot(radius=0.055, color=GREEN),
        ).arrange(RIGHT, buff=0.10)
        dots.move_to(titlebar.get_right() + 0.45 * LEFT)

        return VGroup(frame, titlebar, filename, dots)

    def code_block(self, lines, width=7.0, font_size=24):
        line_objs = []
        for text, color in lines:
            if text == "":
                # Invisible spacer with real line metrics: whitespace-only
                # Text collapses to zero height and breaks arrange spacing.
                t = Text("X", font=MONO, font_size=font_size, color=TEXT)
                t.set_opacity(0)
            else:
                t = Text(text, font=MONO, font_size=font_size, color=color)
            line_objs.append(t)

        group = VGroup(*line_objs).arrange(
            DOWN,
            aligned_edge=LEFT,
            buff=0.12,
        )

        # ensure it fits expected width
        if group.width > width:
            group.scale_to_fit_width(width)

        return group

    def pill(self, label, color):
        text = Text(
            label,
            font=SANS,
            weight=BOLD,
            color=color,
            font_size=22,
        )
        box = RoundedRectangle(
            width=text.width + 0.42,
            height=text.height + 0.24,
            corner_radius=0.14,
            stroke_color=color,
            stroke_width=1.3,
            fill_color=BG,
            fill_opacity=1,
        )
        text.move_to(box)
        return VGroup(box, text)

    def check_row(self, tool, purpose, color):
        check = Text("✓", font=SANS, weight=BOLD, color=color, font_size=24)
        name = Text(tool, font=MONO, color=TEXT, font_size=22)
        arrow = Text("→", font=SANS, color=DIM, font_size=22)
        desc = Text(purpose, font=SANS, color=MUTED, font_size=21)

        return VGroup(check, name, arrow, desc).arrange(RIGHT, buff=0.14)

    def stack_row(self, tool, purpose, color):
        name = Text(tool, font=MONO, weight=BOLD, color=color, font_size=28)
        divider = Text("→", font=SANS, color=DIM, font_size=28)
        desc = Text(purpose, font=SANS, color=TEXT, font_size=27)
        return VGroup(name, divider, desc).arrange(RIGHT, buff=0.22)

    def labeled_box(self, title, subtitle, color, width, height):
        rect = RoundedRectangle(
            width=width,
            height=height,
            corner_radius=0.14,
            stroke_color=color,
            stroke_width=1.8,
            fill_color=PANEL,
            fill_opacity=1,
        )
        t1 = Text(
            title,
            font=MONO,
            weight=BOLD,
            color=color,
            font_size=26,
        )
        t2 = Text(
            subtitle,
            font=SANS,
            color=MUTED,
            font_size=18,
        )
        inner = VGroup(t1, t2).arrange(DOWN, buff=0.09).move_to(rect)
        return VGroup(rect, inner)

    def small_callout(self, text, width=3.2, color=YELLOW):
        t = Text(
            text,
            font=MONO,
            color=TEXT,
            font_size=18,
            line_spacing=0.95,
        )

        if t.width > width - 0.35:
            t.scale_to_fit_width(width - 0.35)

        rect = RoundedRectangle(
            width=width,
            height=max(0.88, t.height + 0.42),
            corner_radius=0.12,
            stroke_color=color,
            stroke_width=1.6,
            fill_color=PANEL_2,
            fill_opacity=1,
        )
        t.move_to(rect)
        return VGroup(rect, t)
