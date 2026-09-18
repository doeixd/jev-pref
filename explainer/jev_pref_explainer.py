from manim import *

# Render with:
#   manim -qh jev_pref_explainer.py JevPrefExplainer
# (-p preview omitted for headless runs; add -p to preview locally.)
# For 1080p60:
#   manim -qh --fps 60 jev_pref_explainer.py JevPrefExplainer

config.background_color = BLACK
config.frame_width = 16
config.frame_height = 9
config.pixel_width = 1920
config.pixel_height = 1080
config.frame_rate = 30

WHITE_90 = "#EDEDED"
WHITE_70 = "#BDBDBD"
WHITE_45 = "#999999"
WHITE_25 = "#444444"


class JevPrefExplainer(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        self.title_scene()
        self.tooling_gap_scene()
        self.preference_scene()
        self.diff_scene()
        self.verdict_scene()
        self.raw_scene()
        self.agent_loop_scene()
        self.final_scene()

    # ---------- helpers ----------
    def t(self, text, size=42, color=WHITE_90, weight=NORMAL, font="Segoe UI", **kwargs):
        return Text(text, font=font, font_size=size, color=color, weight=weight, **kwargs)

    def mono(self, text, size=31, color=WHITE_90, **kwargs):
        return Text(text, font="Cascadia Mono", font_size=size, color=color, **kwargs)

    def box(self, width, height, stroke=WHITE_45, fill=BLACK, radius=0.18, stroke_width=2, opacity=1):
        return RoundedRectangle(
            width=width,
            height=height,
            corner_radius=radius,
            stroke_color=stroke,
            stroke_width=stroke_width,
            fill_color=fill,
            fill_opacity=opacity,
        )

    def label_box(self, title, subtitle=None, width=4.2, height=1.35, title_size=34):
        rect = self.box(width, height)
        title_m = self.t(title, title_size, weight=BOLD)
        if subtitle:
            sub_m = self.t(subtitle, 22, color=WHITE_70)
            group = VGroup(title_m, sub_m).arrange(DOWN, buff=0.12)
        else:
            group = VGroup(title_m)
        if group.width > width - 0.5:
            group.scale_to_fit_width(width - 0.5)
        if group.height > height - 0.35:
            group.scale_to_fit_height(height - 0.35)
        group.move_to(rect.get_center())
        return VGroup(rect, group)

    def section_label(self, text):
        label = self.t(text.upper(), 20, color=WHITE_45, weight=BOLD)
        label.to_edge(UP, buff=0.35).to_edge(LEFT, buff=0.55)
        return label

    def wipe(self, *mobjects, run_time=0.45):
        mobs = [m for m in mobjects if m is not None]
        if mobs:
            self.play(*[FadeOut(m, shift=0.08 * UP) for m in mobjects if m is not None], run_time=run_time)
        self.clear()

    def hold(self, seconds=3):
        # Check complete compositions, including labels below cards.
        for mob in self.mobjects:
            if not mob.width or not mob.height:
                continue
            assert mob.get_left()[0] >= -7.6, f"Clipped left: {mob}"
            assert mob.get_right()[0] <= 7.6, f"Clipped right: {mob}"
            assert mob.get_top()[1] <= 4.25, f"Clipped top: {mob}"
            assert mob.get_bottom()[1] >= -4.25, f"Clipped bottom: {mob}"
        self.wait(seconds)

    def threshold_bar(self, p, width=4.4, height=0.42):
        """Estimated violation probability against an example policy cutoff."""
        track = self.box(width, height, stroke=WHITE_45, radius=0.08)
        fill = Rectangle(
            width=width * p, height=height, color=WHITE_90,
            fill_opacity=0.85, stroke_width=0,
        )
        fill.move_to(track.get_center()).align_to(track, LEFT)
        gate_x = track.get_left()[0] + width * 0.70
        gate = Line(
            start=[gate_x, track.get_top()[1] + 0.15, 0],
            end=[gate_x, track.get_bottom()[1] - 0.15, 0],
            color=WHITE_90, stroke_width=5,
        )
        gate_label = self.t("cutoff 0.70", 20, color=WHITE_70)
        gate_label.next_to(gate, DOWN, buff=0.2)
        return VGroup(track, fill, gate, gate_label)

    # ---------- scenes ----------
    def title_scene(self):
        mark = self.box(1.15, 1.15, stroke=WHITE_90, radius=0.22, stroke_width=3)
        j = self.t("J", 56, weight=BOLD).move_to(mark)
        logo = VGroup(mark, j)

        title = self.t("jev-pref", 78, weight=BOLD)
        subtitle = self.t("A semantic linter for coding agents", 34, color=WHITE_70)
        stack = VGroup(logo, title, subtitle).arrange(DOWN, buff=0.3)
        stack.move_to(ORIGIN)

        self.play(DrawBorderThenFill(mark), FadeIn(j), run_time=0.8)
        self.play(Write(title), run_time=0.75)
        self.play(FadeIn(subtitle, shift=0.12 * UP), run_time=0.65)
        self.wait(1.25)

        thesis = self.t(
            "Check code changes against your project's written rules.",
            30,
            color=WHITE_90,
        ).next_to(stack, DOWN, buff=0.65)
        self.play(FadeIn(thesis), run_time=0.6)
        self.hold(3)
        self.wipe(stack, thesis)

    def tooling_gap_scene(self):
        section = self.section_label("The missing layer")
        self.play(FadeIn(section))

        tools = [
            ("TypeScript", "type invariants"),
            ("ESLint", "syntax + static rules"),
            ("tests", "behavioral invariants"),
        ]
        rows = VGroup()
        for name, desc in tools:
            left = self.mono(name, 30, color=WHITE_90)
            arrow = self.t("→", 30, color=WHITE_45)
            right = self.t(desc, 28, color=WHITE_70)
            row = VGroup(left, arrow, right).arrange(RIGHT, buff=0.35)
            rows.add(row)
        rows.arrange(DOWN, buff=0.4, aligned_edge=LEFT)
        rows.move_to(UP * 0.8)
        rows.shift(LEFT * 1.2)

        for row in rows:
            self.play(FadeIn(row, shift=0.18 * RIGHT), run_time=0.42)

        gap_line = Line(LEFT * 5.5, RIGHT * 5.5, color=WHITE_25, stroke_width=2)
        gap_line.next_to(rows, DOWN, buff=0.6)
        question = self.t("But what enforces project-specific semantic rules?", 33, weight=BOLD)
        question.next_to(gap_line, DOWN, buff=0.5)
        self.play(Create(gap_line), FadeIn(question, shift=0.1 * UP))
        self.wait(1.1)

        jev_row = VGroup(
            self.mono("jev-pref", 31, color=WHITE_90),
            self.t("→", 30, color=WHITE_45),
            self.t("semantic project invariants", 30, color=WHITE_90, weight=BOLD),
        ).arrange(RIGHT, buff=0.35)
        jev_row.next_to(question, DOWN, buff=0.65)
        highlight = self.box(8.6, 1.0, stroke=WHITE_90, radius=0.18, stroke_width=2)
        highlight.move_to(jev_row)

        self.play(DrawBorderThenFill(highlight), FadeIn(jev_row), run_time=0.8)
        self.hold(3)
        self.wipe(section, rows, gap_line, question, highlight, jev_row)

    def preference_scene(self):
        section = self.section_label("01 / Turn guidance into a question")
        heading = self.t("Start with a rule the project defines.", 36, weight=BOLD)
        heading.move_to(UP * 2.9)

        left = self.box(6.0, 3.1).move_to(LEFT * 3.6 + UP * 0.25)
        right = self.box(6.0, 3.1, stroke=WHITE_90).move_to(RIGHT * 3.6 + UP * 0.25)
        guidance = VGroup(
            self.mono("AGENTS.md", 25, color=WHITE_70),
            self.t("Use our existing Surface contract\nfor transport capabilities.", 27),
            self.t("Do not define a second contract\nfor the same capability.", 25, color=WHITE_70),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.3).move_to(left)
        check = VGroup(
            self.mono("jev-pref.json", 25, color=WHITE_70),
            self.t("Does this change add a second\ncontract for a transport capability\nalready defined by Surface?", 26),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.4).move_to(right)
        arrow = Arrow(left.get_right(), right.get_left(), buff=0.15, color=WHITE_70)
        bridge = self.t("The coding agent turns your guidance into a specific check.", 28)
        bridge.move_to(DOWN * 2.25)
        footer = self.t("Define what counts as a violation before asking Jev.", 28, color=WHITE_70)
        footer.move_to(DOWN * 3.35)

        self.play(FadeIn(section), FadeIn(heading), run_time=0.6)
        self.play(Create(left), FadeIn(guidance), run_time=0.7)
        self.hold(3.5)
        self.play(GrowArrow(arrow), Create(right), FadeIn(check), run_time=0.8)
        self.play(FadeIn(bridge), FadeIn(footer), run_time=0.6)
        self.hold(5)
        self.wipe(*self.mobjects)

    def diff_scene(self):
        section = self.section_label("02 / Give Jev the evidence")
        cmd = self.mono("$ npx jev-pref review --hunks", 31).move_to(UP * 2.9)
        panel = self.box(12.8, 4.45).move_to(UP * 0.05)
        label = self.t("Illustrative diff · the existing contract is visible in context", 23, color=WHITE_70)
        label.move_to(UP * 1.85)
        lines = VGroup(*[
            self.mono(text, 25, color=color)
            for text, color in [
                ("  interface Surface {", WHITE_70),
                ("    send(request: Request): Promise<Response>", WHITE_70),
                ("  }", WHITE_70),
                ("+ interface TransportSurface {", WHITE_90),
                ("+   send(request: Request): Promise<Response>", WHITE_90),
                ("+ }", WHITE_90),
            ]
        ]).arrange(DOWN, aligned_edge=LEFT, buff=0.18)
        lines.move_to(DOWN * 0.25)
        lens = SurroundingRectangle(VGroup(*lines[3:]), buff=0.16, color=WHITE_90, corner_radius=0.08)
        question = self.t("Same send capability. A second contract.", 30, weight=BOLD).move_to(DOWN * 2.8)
        note = self.t("Jev receives the question and the selected diff context.", 26, color=WHITE_70)
        note.move_to(DOWN * 3.55)

        self.play(FadeIn(section), FadeIn(cmd), run_time=0.7)
        self.play(Create(panel), FadeIn(label), FadeIn(lines), run_time=0.8)
        self.hold(4)
        self.play(Create(lens), FadeIn(question), FadeIn(note), run_time=0.7)
        self.hold(4)
        self.wipe(*self.mobjects)

    def verdict_scene(self):
        section = self.section_label("03 / Estimate, then apply your policy")
        heading = self.t("How likely is this rule to be violated?", 36, weight=BOLD)
        heading.move_to(UP * 2.9)
        example = self.t("Illustrative scores · not a recorded evaluation", 21, color=WHITE_70)
        example.move_to(UP * 2.25)
        cards = VGroup(*[
            self.label_box(title, subtitle, width=4.0, height=1.25, title_size=31)
            for title, subtitle in [
                ("Jev", "estimates probability"),
                ("jev-pref", "applies your settings"),
                ("coding agent", "inspects the finding"),
            ]
        ]).arrange(RIGHT, buff=0.7).move_to(UP * 1.15)
        arrows = VGroup(*[
            Arrow(cards[i].get_right(), cards[i + 1].get_left(), buff=0.1, color=WHITE_70)
            for i in range(2)
        ])
        probability = VGroup(
            self.t("Second contract?", 25, color=WHITE_70),
            self.mono("P = 0.91", 34),
            self.t("91% estimated probability\nthat the violation is present.", 22, color=WHITE_70),
        ).arrange(DOWN, buff=0.24).move_to(LEFT * 4.7 + DOWN * 0.85)
        policy = VGroup(
            self.mono("gate: false", 26),
            self.t("advisory cutoff: 0.70", 23, color=WHITE_70),
            self.mono("0.91 >= 0.70", 26),
        ).arrange(DOWN, buff=0.27).move_to(DOWN * 0.85)
        finding = VGroup(
            self.t("ADVISORY", 29, weight=BOLD),
            self.t("Inspect the duplication.\nFix it or explain why\nit is acceptable.", 24, color=WHITE_70),
        ).arrange(DOWN, buff=0.3).move_to(RIGHT * 4.7 + DOWN * 0.85)
        bar = self.threshold_bar(0.91, width=3.65)
        bar.move_to(LEFT * 4.7 + DOWN * 2.55)
        footer = self.t("You choose advisory or blocking. Probability controls whether it fires.", 26)
        footer.move_to(DOWN * 3.55)

        self.play(FadeIn(section), FadeIn(heading), FadeIn(example), run_time=0.6)
        self.play(FadeIn(cards[0]), FadeIn(probability), FadeIn(bar), run_time=0.8)
        self.hold(4)
        self.play(GrowArrow(arrows[0]), FadeIn(cards[1]), FadeIn(policy), run_time=0.8)
        self.hold(3)
        self.play(GrowArrow(arrows[1]), FadeIn(cards[2]), FadeIn(finding), FadeIn(footer), run_time=0.8)
        self.hold(4)
        self.wipe(*self.mobjects)

    def raw_scene(self):
        section = self.section_label("Optional / Interpret probabilities yourself")
        heading = self.t("Want the signal without a verdict?", 38, weight=BOLD).move_to(UP * 2.65)
        cmd = self.mono("$ npx jev-pref review --raw --hunks", 30).move_to(UP * 1.5)
        left = self.label_box("P = 0.67", "probability of a violation", width=4.4, height=1.6)
        left.move_to(LEFT * 3.7 + DOWN * 0.4)
        right = self.label_box("Your agent or script", "decides what to do next", width=5.1, height=1.6, title_size=29)
        right.move_to(RIGHT * 3.35 + DOWN * 0.4)
        arrow = Arrow(left.get_right(), right.get_left(), buff=0.2, color=WHITE_70)
        explanation = self.t("Raw mode reports probabilities without applying verdicts.", 29)
        explanation.move_to(DOWN * 2.2)
        note = self.t("Example: inspect a borderline result using more project context.", 26, color=WHITE_70)
        note.move_to(DOWN * 3.1)
        self.play(FadeIn(section), FadeIn(heading), FadeIn(cmd), run_time=0.7)
        self.play(FadeIn(left), GrowArrow(arrow), FadeIn(right), run_time=0.8)
        self.play(FadeIn(explanation), FadeIn(note), run_time=0.6)
        self.hold(5)
        self.wipe(*self.mobjects)

    def agent_loop_scene(self):
        section = self.section_label("04 / Review, act, and review again")
        cmd = self.mono("$ npx jev-pref review --hunks", 29).move_to(UP * 2.9)
        boxes = VGroup(*[
            self.label_box(a, b, width=3.7, height=1.4, title_size=31)
            for a, b in [
                ("implement", "agent edits code"),
                ("review", "Jev evaluates the diff"),
                ("act", "agent examines findings"),
            ]
        ]).arrange(RIGHT, buff=1.1).move_to(UP * 0.7)
        arrows = VGroup(*[
            Arrow(boxes[i].get_right(), boxes[i + 1].get_left(), buff=0.18, color=WHITE_70)
            for i in range(2)
        ])
        # Route the retry above the cards; completion has its own lane below.
        retry = VMobject(color=WHITE_70, stroke_width=2)
        retry.set_points_as_corners([
            boxes[2].get_top() + UP * 0.12,
            [4.8, 2.05, 0], [0, 2.05, 0], [0, 1.65, 0],
        ])
        retry_tip = Arrow([0, 1.85, 0], [0, 1.45, 0], buff=0, color=WHITE_70)
        retry_label = self.t("After a fix, review the updated diff", 21, color=WHITE_70)
        retry_label.move_to([2.5, 2.35, 0])
        done = self.label_box("continue", "when policy allows", width=3.7, height=1.15, title_size=28)
        done.move_to([4.8, -1.75, 0])
        down = Arrow(boxes[2].get_bottom(), done.get_top(), buff=0.16, color=WHITE_90)
        detail = self.t("Blocking: fix and rerun.\nAdvisory: fix or explain.", 27)
        detail.move_to([-2, -1.7, 0])
        caption = self.t("The coding agent changes the code. Jev supplies the review signal.", 27)
        caption.move_to(DOWN * 3.4)

        self.play(FadeIn(section), FadeIn(cmd), run_time=0.6)
        self.play(LaggedStart(*[FadeIn(b) for b in boxes], lag_ratio=0.2), run_time=1)
        self.play(*[GrowArrow(a) for a in arrows], run_time=0.7)
        self.play(FadeIn(detail), run_time=0.5)
        self.hold(3)
        self.play(Create(retry), FadeIn(retry_tip), FadeIn(retry_label), run_time=0.7)
        self.hold(2)
        self.play(GrowArrow(down), FadeIn(done), FadeIn(caption), run_time=0.7)
        self.hold(4)
        self.wipe(*self.mobjects)

    def final_scene(self):
        lines = VGroup(
            self.t("Your project rules.", 45, weight=BOLD),
            self.t("An independent check on each change.", 39, weight=BOLD),
        ).arrange(DOWN, buff=0.1)
        lines.move_to(UP * 2.0)

        self.play(FadeIn(lines, shift=0.2 * UP), run_time=0.8)
        self.wait(0.8)

        roles = VGroup(
            self.t("YOU define the rule", 28, color=WHITE_70),
            self.t("JEV estimates whether it is violated", 28, color=WHITE_70),
            self.t("JEV-PREF applies your policy", 28, color=WHITE_70),
            self.t("YOUR AGENT acts on the result", 28, color=WHITE_70),
        ).arrange(DOWN, buff=0.22)
        roles.next_to(lines, DOWN, buff=0.6)
        self.play(LaggedStart(*[FadeIn(x, shift=0.08 * RIGHT) for x in roles], lag_ratio=0.2), run_time=1.0)
        self.hold(3)

        cmd_box = self.box(6.6, 1.05, stroke=WHITE_90, radius=0.16, stroke_width=2)
        cmd_box.to_edge(DOWN, buff=0.7)
        cmd = self.mono("npx jev-pref setup", 34).move_to(cmd_box)
        self.play(Create(cmd_box), Write(cmd), run_time=0.8)
        self.hold(4)
