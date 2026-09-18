from manim import *

# ============================================================
# jev-pref explainer v3 — cold-viewer cut
#
# Story: HERE IS THE WORLD -> TOOLS YOU HAVE -> A RULE THEY CAN'T
# EXPRESS -> A REAL FAILURE -> THE MISSING CATEGORY -> HOW IT WORKS
# -> THE GENERAL PATTERN.
#
# Rules: one new concept per beat; 1-2s stillness after big ideas;
# hard self.clear() chapter boundaries; ReplacementTransform (never
# bare Transform) on mismatched groups; every right-column block
# width-capped; assert_in_frame at each beat.
#
# Render:
#   manim -qh jev_pref_story_v3.py JevPrefStoryV3
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

# Layout zones (16 x 9 scene). Editor/workflow lives left of the gutter,
# explanation lives right. Nothing crosses.
RIGHT_CENTER_X = 4.9
RIGHT_MAX_WIDTH = 4.1


def fit_width(mob, max_width):
    if mob.width > max_width:
        mob.scale_to_fit_width(max_width)
    return mob


def assert_in_frame(mob, margin=0.2):
    fw = 16 / 2 - margin
    fh = 9 / 2 - margin
    assert mob.get_left()[0] >= -fw, f"escapes left: {mob}"
    assert mob.get_right()[0] <= fw, f"escapes right: {mob}"
    assert mob.get_bottom()[1] >= -fh, f"escapes bottom: {mob}"
    assert mob.get_top()[1] <= fh, f"escapes top: {mob}"
    return mob


class JevPrefStoryV3(Scene):
    def construct(self):
        self.camera.background_color = BG
        self.ch_world()
        self.ch_tools()
        self.ch_problem()
        self.ch_product()
        self.ch_rule()
        self.ch_jev_then_policy()
        self.ch_loop()
        self.ch_generalize()
        self.ch_mental_model()

    # ---------- shared builders ----------

    def caption(self, text, size=30):
        return Text(text, font=SANS, color=TEXT, font_size=size)

    def panel(self, width, height, title=None):
        rect = RoundedRectangle(
            width=width, height=height, corner_radius=0.14,
            stroke_color=BORDER, stroke_width=1.5,
            fill_color=PANEL, fill_opacity=1,
        )
        if title is None:
            return rect
        title_text = Text(title, font=SANS, weight=BOLD, color=MUTED, font_size=16)
        title_text.move_to(rect.get_top() + DOWN * 0.24 + RIGHT * (-width / 2 + 0.62))
        return VGroup(rect, title_text)

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
        group = VGroup(*line_objs).arrange(DOWN, aligned_edge=LEFT, buff=0.12)
        if group.width > width:
            group.scale_to_fit_width(width)
        return group

    def pill(self, label, color):
        text = Text(label, font=SANS, weight=BOLD, color=color, font_size=22)
        box = RoundedRectangle(
            width=text.width + 0.42, height=text.height + 0.24,
            corner_radius=0.14, stroke_color=color, stroke_width=1.3,
            fill_color=BG, fill_opacity=1,
        )
        text.move_to(box)
        return VGroup(box, text)

    def check_row(self, tool, purpose, color):
        check = Text("✓", font=SANS, weight=BOLD, color=color, font_size=24)
        name = Text(tool, font=MONO, color=TEXT, font_size=22)
        arrow = Text("→", font=SANS, color=DIM, font_size=22)
        desc = Text(purpose, font=SANS, color=MUTED, font_size=21)
        return VGroup(check, name, arrow, desc).arrange(RIGHT, buff=0.14)

    def rule_card(self, title, body_lines, color=YELLOW, width=6.4):
        title_t = Text(title, font=MONO, weight=BOLD, color=color, font_size=24)
        body = VGroup(*[
            Text(line, font=SANS, color=TEXT, font_size=24) for line in body_lines
        ]).arrange(DOWN, aligned_edge=LEFT, buff=0.10)
        card = VGroup(title_t, body).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        fit_width(card, width)
        return card

    def clear_stage(self, *mobjects):
        mobs = [m for m in mobjects if m is not None]
        if mobs:
            self.play(*[FadeOut(m) for m in mobs], run_time=0.5)
        self.clear()

    # ---------- ch 1: the world (0:00-0:07) ----------

    def ch_world(self):
        tree = VGroup(
            Text("MY PROJECT", font=MONO, weight=BOLD, color=TEXT, font_size=30),
            Text("src/", font=MONO, color=MUTED, font_size=26),
            Text("tests/", font=MONO, color=MUTED, font_size=26),
            Text("AGENTS.md", font=MONO, color=ACCENT, font_size=26),
            Text("package.json", font=MONO, color=MUTED, font_size=26),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.16)
        tree.move_to(LEFT * 3.4)
        self.play(FadeIn(tree, shift=0.15 * UP), run_time=0.8)
        self.wait(0.6)

        cap1 = self.caption("A coding agent works on a real software project.")
        cap1.to_edge(DOWN, buff=0.8)
        agent_tag = self.pill("coding agent", BLUE)
        agent_tag.scale(0.8).move_to([RIGHT_CENTER_X, 1.2, 0])
        self.play(FadeIn(agent_tag), FadeIn(cap1, shift=0.1 * UP), run_time=0.7)
        assert_in_frame(agent_tag)
        self.wait(1.4)

        agents = VGroup(
            Text("# Architecture", font=MONO, weight=BOLD, color=ACCENT, font_size=26),
            Text("Compose through Surface.", font=SANS, color=TEXT, font_size=24),
            Text("Avoid parallel representations.", font=SANS, color=TEXT, font_size=24),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.14)
        fit_width(agents, RIGHT_MAX_WIDTH)
        agents.move_to([RIGHT_CENTER_X, -0.9, 0])
        cap2 = self.caption("The project already has architectural intent.")
        cap2.to_edge(DOWN, buff=0.8)
        self.play(
            FadeOut(cap1),
            FadeIn(agents, shift=0.1 * LEFT),
            FadeIn(cap2, shift=0.1 * UP),
            run_time=0.8,
        )
        assert_in_frame(agents)
        self.wait(1.6)
        self.clear_stage(tree, agent_tag, agents, cap2)

    # ---------- ch 2: normal tooling (0:07-0:15) ----------

    def ch_tools(self):
        rows = VGroup(
            self.check_row("TypeScript", "catches type errors", GREEN),
            self.check_row("ESLint", "catches static patterns", GREEN),
            self.check_row("tests", "catch behavioral regressions", GREEN),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        rows.move_to(ORIGIN + UP * 0.9)
        for row in rows:
            self.play(FadeIn(row, shift=0.12 * RIGHT), run_time=0.4)
        assert_in_frame(rows)
        self.wait(1.2)

        key = self.caption("But not every important rule is a type error, a lint rule, or a failing test.")
        key.to_edge(DOWN, buff=1.0)
        fit_width(key, 13.0)
        self.play(FadeIn(key, shift=0.1 * UP), run_time=0.6)
        assert_in_frame(key)
        self.wait(1.8)
        self.clear_stage(rows, key)

    # ---------- ch 3: the concrete failure (0:15-0:24) ----------

    def make_editor(self):
        frame = RoundedRectangle(
            width=8.2, height=4.55, corner_radius=0.16,
            stroke_color=BORDER, stroke_width=1.6,
            fill_color=PANEL, fill_opacity=1,
        )
        frame.to_edge(LEFT, buff=0.55).shift(0.6 * UP)
        titlebar = Rectangle(width=8.0, height=0.48, stroke_width=0, fill_color=PANEL_2, fill_opacity=1)
        titlebar.move_to(frame.get_top() + 0.28 * DOWN)
        filename = Text("transport.ts", font=MONO, color=MUTED, font_size=18)
        filename.move_to(titlebar.get_center()).align_to(titlebar, LEFT).shift(0.22 * RIGHT)
        dots = VGroup(*[Dot(radius=0.055, color=c) for c in (RED, YELLOW, GREEN)]).arrange(RIGHT, buff=0.10)
        dots.move_to(titlebar.get_right() + 0.45 * LEFT)
        return VGroup(frame, titlebar, filename, dots)

    def ch_problem(self):
        editor = self.make_editor()
        self.play(FadeIn(editor, shift=0.15 * UP), run_time=0.8)
        assert_in_frame(editor)

        base = self.code_block(
            [
                ("import { Surface } from './surface'", MUTED),
                ("", TEXT),
                ("export const transport = Surface.make({", TEXT),
                ("  send: request => fetch(request)", TEXT),
                ("})", TEXT),
            ],
            width=7.4, font_size=26,
        )
        base.move_to(editor.get_center() + 0.05 * DOWN)
        callout = self.caption("The project already uses Surface for this boundary.", size=24)
        fit_width(callout, RIGHT_MAX_WIDTH)
        callout.move_to([RIGHT_CENTER_X, 1.2, 0])
        self.play(FadeIn(base, shift=0.1 * RIGHT), FadeIn(callout, shift=0.1 * UP), run_time=0.7)
        assert_in_frame(callout)
        self.wait(1.6)

        added = self.code_block(
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
            width=7.4, font_size=25,
        )
        added.move_to(base)
        code_current = base
        self.play(ReplacementTransform(code_current, added), run_time=1.0)
        code_current = added
        cap = self.caption("The agent adds TransportSurface for essentially the same concept.")
        cap.to_edge(DOWN, buff=0.8)
        fit_width(cap, 13.0)
        self.play(FadeIn(cap, shift=0.1 * UP), run_time=0.6)
        self.wait(1.4)

        passes = VGroup(
            self.check_row("TypeScript", "valid", GREEN),
            self.check_row("ESLint", "clean", GREEN),
            self.check_row("tests", "passing", GREEN),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.14)
        fit_width(passes, RIGHT_MAX_WIDTH)
        passes.move_to([RIGHT_CENTER_X, -0.6, 0])
        note = self.caption("Valid code. Passing tests. The architecture is still violated.")
        note.to_edge(DOWN, buff=0.8)
        fit_width(note, 13.0)
        self.play(FadeOut(callout), FadeOut(cap), FadeIn(passes), FadeIn(note, shift=0.1 * UP), run_time=0.7)
        assert_in_frame(passes)
        self.wait(1.4)

        hook = self.caption("How do you lint that?")
        hook.move_to([RIGHT_CENTER_X, -2.2, 0])
        self.play(FadeIn(hook, shift=0.1 * UP), run_time=0.6)
        self.wait(1.6)
        self.clear_stage(editor, code_current, callout, passes, note, hook, cap)

    # ---------- ch 4: the product (0:24-0:31) ----------

    def ch_product(self):
        title = Text("jev-pref", font=MONO, weight=BOLD, color=TEXT, font_size=64)
        sub = Text("A semantic linter for coding agents.", font=SANS, color=ACCENT, font_size=30)
        head = VGroup(title, sub).arrange(DOWN, buff=0.2)
        head.move_to(ORIGIN + UP * 1.3)
        self.play(FadeIn(title, shift=0.15 * UP), FadeIn(sub, shift=0.1 * UP), run_time=0.9)
        assert_in_frame(head)
        self.wait(1.4)

        stack = VGroup(
            self.check_row("TypeScript", "types", GREEN),
            self.check_row("ESLint", "static rules", GREEN),
            self.check_row("tests", "behavior", GREEN),
            self.check_row("jev-pref", "project-specific semantic rules", YELLOW),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.20)
        fit_width(stack, 9.0)
        stack.move_to(ORIGIN + DOWN * 1.2)
        for row in stack:
            self.play(FadeIn(row, shift=0.12 * RIGHT), run_time=0.35)
        assert_in_frame(stack)
        self.wait(1.8)
        self.clear_stage(head, stack)

    # ---------- ch 5: where the rule comes from (0:31-0:41) ----------

    def ch_rule(self):
        card = self.rule_card(
            "AGENTS.md",
            ["Compose through Surface.", "Avoid parallel representations."],
        )
        card.move_to(LEFT * 3.4)
        self.play(FadeIn(card, shift=0.12 * RIGHT), run_time=0.7)
        cap1 = self.caption("The rule still comes from you and your project.")
        cap1.to_edge(DOWN, buff=0.8)
        self.play(FadeIn(cap1, shift=0.1 * UP), run_time=0.6)
        self.wait(1.6)

        question = self.rule_card(
            "jev-pref check",
            ["Does this introduce another", "representation of Surface?"],
            color=BLUE,
        )
        question.move_to(RIGHT * 3.4)
        self.play(FadeOut(cap1), FadeIn(question, shift=0.12 * LEFT), run_time=0.8)
        cap2 = self.caption("Your agent turns guidance into a narrow question with a defined answer.")
        cap2.to_edge(DOWN, buff=0.8)
        fit_width(cap2, 13.0)
        self.play(FadeIn(cap2, shift=0.1 * UP), run_time=0.6)
        self.wait(1.4)

        contrast = VGroup(
            Text("X  Is this good architecture?", font=SANS, color=DIM, font_size=26),
            Text("✓  Does this duplicate Surface?", font=SANS, color=TEXT, font_size=26),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.18)
        fit_width(contrast, 9.0)
        contrast.to_edge(DOWN, buff=1.9)
        cap3 = self.caption("Classification against your rule — not open-ended review.")
        cap3.to_edge(DOWN, buff=0.8)
        self.play(FadeOut(card), FadeOut(cap2), FadeIn(contrast, shift=0.1 * UP), FadeIn(cap3, shift=0.1 * UP), run_time=0.8)
        assert_in_frame(contrast)
        self.wait(1.8)
        self.clear_stage(question, contrast, cap3)

    # ---------- ch 6: Jev, then policy (0:41-0:52) ----------

    def ch_jev_then_policy(self):
        beat1 = Text("When the agent reviews, Jev answers that one question.", font=SANS, color=MUTED, font_size=26)
        fit_width(beat1, 12.0)
        beat1.to_edge(UP, buff=1.2)
        jev = VGroup(
            Text("Jev", font=MONO, weight=BOLD, color=BLUE, font_size=44),
            Text("classifies the evidence", font=SANS, color=MUTED, font_size=24),
        ).arrange(DOWN, buff=0.14)
        jev.move_to(ORIGIN + UP * 0.4)
        prob = Text("P(true) = 0.91", font=MONO, weight=BOLD, color=YELLOW, font_size=40)
        prob.next_to(jev, DOWN, buff=0.4)
        self.play(FadeIn(beat1, shift=0.1 * DOWN), FadeIn(jev, shift=0.1 * UP), run_time=0.8)
        self.play(FadeIn(prob, shift=0.1 * UP), run_time=0.6)
        cap1 = self.caption("91 percent probability of a parallel representation.")
        cap1.to_edge(DOWN, buff=0.8)
        self.play(FadeIn(cap1, shift=0.1 * UP), run_time=0.5)
        assert_in_frame(prob)
        self.wait(1.6)

        beat2 = Text("Then jev-pref applies your deterministic policy.", font=SANS, color=MUTED, font_size=26)
        fit_width(beat2, 12.0)
        beat2.to_edge(UP, buff=1.2)
        policy = VGroup(
            Text("0.91  vs  advisory threshold 0.70", font=MONO, color=TEXT, font_size=30),
            Text("ADVISORY", font=SANS, weight=BOLD, color=YELLOW, font_size=38),
        ).arrange(DOWN, buff=0.2)
        policy.move_to(ORIGIN + DOWN * 0.4)
        self.play(
            FadeOut(beat1), FadeOut(jev), FadeOut(prob), FadeOut(cap1),
            FadeIn(beat2, shift=0.1 * DOWN), FadeIn(policy, shift=0.1 * UP),
            run_time=0.8,
        )
        cap2 = self.caption("Jev classifies. jev-pref decides the consequence.")
        cap2.to_edge(DOWN, buff=0.8)
        self.play(FadeIn(cap2, shift=0.1 * UP), run_time=0.5)
        assert_in_frame(policy)
        self.wait(1.8)
        self.clear_stage(beat2, policy, cap2)

    # ---------- ch 7: the agent loop (0:52-1:02) ----------

    def ch_loop(self):
        diag = self.pill("parallel abstraction  ·  P = 0.91", YELLOW)
        diag.scale(0.85)
        diag.move_to(ORIGIN + UP * 1.4)
        cap1 = self.caption("The result returns like a semantic lint finding.")
        cap1.to_edge(DOWN, buff=0.8)
        self.play(FadeIn(diag, shift=0.1 * DOWN), FadeIn(cap1, shift=0.1 * UP), run_time=0.7)
        assert_in_frame(diag)
        self.wait(1.4)

        cap2 = self.caption("jev-pref doesn't rewrite code. The agent still fixes it.")
        cap2.to_edge(DOWN, buff=0.8)
        rerun = Text("$ npx jev-pref review --hunks", font=MONO, color=TEXT, font_size=30)
        rerun.move_to(ORIGIN + DOWN * 0.2)
        result = Text("P = 0.08   →   APPROVE", font=MONO, weight=BOLD, color=GREEN, font_size=30)
        result.next_to(rerun, DOWN, buff=0.3)
        self.play(
            FadeOut(diag), FadeOut(cap1),
            FadeIn(cap2, shift=0.1 * UP),
            FadeIn(rerun, shift=0.1 * UP),
            run_time=0.7,
        )
        self.play(FadeIn(result, shift=0.1 * UP), run_time=0.6)
        cap3 = self.caption("Fix, rerun the same check, move on.")
        cap3.to_edge(DOWN, buff=0.8)
        self.play(FadeIn(cap3, shift=0.1 * UP), run_time=0.5)
        assert_in_frame(result)
        self.wait(1.8)
        self.clear_stage(cap2, rerun, result, cap3)

    # ---------- ch 8: generalize (1:02-1:12) ----------

    def ch_generalize(self):
        intro = self.caption("The same pattern encodes rules that live only in docs and heads.")
        intro.to_edge(UP, buff=1.2)
        fit_width(intro, 13.0)
        self.play(FadeIn(intro, shift=0.1 * DOWN), run_time=0.6)
        self.wait(1.0)

        examples = VGroup(
            Text("Don't introduce shared mutable state.", font=SANS, color=TEXT, font_size=28),
            Text("Don't create parallel domain abstractions.", font=SANS, color=TEXT, font_size=28),
            Text("Classify API changes: none / additive / behavioral / breaking.", font=SANS, color=TEXT, font_size=28),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        fit_width(examples, 11.0)
        examples.move_to(ORIGIN + DOWN * 0.3)
        for row in examples:
            self.play(FadeIn(row, shift=0.12 * RIGHT), run_time=0.5)
            self.wait(0.9)
        assert_in_frame(examples)
        self.wait(1.2)
        self.clear_stage(intro, examples)

    # ---------- ch 9: mental model + CTA (1:12-1:18+) ----------

    def ch_mental_model(self):
        rows = VGroup(
            Text("PROJECT  defines the rule", font=SANS, weight=BOLD, color=TEXT, font_size=30),
            Text("JEV  classifies the evidence", font=SANS, weight=BOLD, color=TEXT, font_size=30),
            Text("JEV-PREF  applies the policy", font=SANS, weight=BOLD, color=TEXT, font_size=30),
            Text("CODING AGENT  acts on the finding", font=SANS, weight=BOLD, color=TEXT, font_size=30),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        fit_width(rows, 11.0)
        rows.move_to(ORIGIN + UP * 0.6)
        for row in rows:
            self.play(FadeIn(row, shift=0.1 * RIGHT), run_time=0.4)
        assert_in_frame(rows)
        self.wait(1.4)

        cmd = Text("$ npx jev-pref setup", font=MONO, color=GREEN, font_size=32)
        cmd.next_to(rows, DOWN, buff=0.6)
        self.play(FadeIn(cmd, shift=0.1 * UP), run_time=0.6)
        assert_in_frame(cmd)
        self.wait(2.2)
