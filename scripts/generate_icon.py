from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SIZE = 1024


def cubic(p0, p1, p2, p3, steps=80):
    points = []
    for index in range(steps + 1):
        t = index / steps
        u = 1 - t
        points.append((
            u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
        ))
    return points


def create_icon():
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((190, 210, 875, 900), fill=(242, 193, 78, 68))
    glow = glow.filter(ImageFilter.GaussianBlur(105))
    canvas.alpha_composite(glow)

    background = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(background)
    bg_draw.rounded_rectangle(
        (36, 36, 988, 988),
        radius=220,
        fill=(22, 19, 15, 255),
        outline=(80, 63, 32, 255),
        width=8,
    )
    bg_draw.rounded_rectangle(
        (60, 60, 964, 964),
        radius=198,
        outline=(242, 193, 78, 28),
        width=4,
    )
    canvas.alpha_composite(background)

    banana_shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(banana_shadow)
    outer = cubic((242, 304), (286, 730), (632, 906), (828, 610))
    inner = cubic((738, 548), (612, 722), (420, 670), (326, 334))
    banana_polygon = outer + inner
    shadow_draw.polygon([(x + 10, y + 28) for x, y in banana_polygon], fill=(0, 0, 0, 125))
    banana_shadow = banana_shadow.filter(ImageFilter.GaussianBlur(24))
    canvas.alpha_composite(banana_shadow)

    banana = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    banana_draw = ImageDraw.Draw(banana)
    banana_draw.polygon(banana_polygon, fill=(242, 193, 78, 255))
    banana_draw.line(outer, fill=(255, 226, 113, 255), width=16, joint="curve")
    banana_draw.line(inner, fill=(201, 125, 40, 255), width=13, joint="curve")

    highlight = cubic((292, 345), (350, 610), (555, 760), (740, 620), steps=55)
    banana_draw.line(highlight, fill=(255, 236, 155, 150), width=22, joint="curve")
    banana_draw.ellipse((242, 280, 342, 370), fill=(217, 123, 58, 255))
    banana_draw.rounded_rectangle((266, 245, 322, 316), radius=20, fill=(118, 75, 34, 255))
    banana_draw.ellipse((754, 548, 844, 638), fill=(217, 123, 58, 230))
    canvas.alpha_composite(banana)

    spark_glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    spark_glow_draw = ImageDraw.Draw(spark_glow)
    spark_glow_draw.ellipse((670, 180, 930, 440), fill=(242, 193, 78, 100))
    spark_glow = spark_glow.filter(ImageFilter.GaussianBlur(60))
    canvas.alpha_composite(spark_glow)

    spark_draw = ImageDraw.Draw(canvas)
    spark_draw.polygon(
        [(800, 190), (826, 282), (918, 308), (826, 334), (800, 426), (774, 334), (682, 308), (774, 282)],
        fill=(255, 235, 154, 255),
    )
    spark_draw.polygon(
        [(640, 238), (652, 276), (690, 288), (652, 300), (640, 338), (628, 300), (590, 288), (628, 276)],
        fill=(217, 123, 58, 255),
    )

    return canvas


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    icon = create_icon()
    icon.save(ASSETS / "icon.png", optimize=True)
    icon.save(
        ASSETS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
