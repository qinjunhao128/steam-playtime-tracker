import unittest

from steam_playtime.steam import normalize_game


class NormalizeGameTests(unittest.TestCase):
    def test_normalizes_required_fields(self) -> None:
        game = normalize_game(
            {
                "appid": "400",
                "name": "Portal",
                "playtime_forever": "125",
                "img_icon_url": "abc",
            }
        )

        self.assertEqual(game.appid, 400)
        self.assertEqual(game.name, "Portal")
        self.assertEqual(game.playtime_forever_minutes, 125)
        self.assertEqual(game.img_icon_hash, "abc")

    def test_clamps_negative_playtime(self) -> None:
        game = normalize_game({"appid": 10, "playtime_forever": -5})

        self.assertEqual(game.name, "App 10")
        self.assertEqual(game.playtime_forever_minutes, 0)


if __name__ == "__main__":
    unittest.main()
