"""
Checks the UI driver's screen matching against real screen dumps taken on the
CI emulator (e2e/fixtures), so a change to ui.py is proven before a slow
emulator run.  Run:  python3 -m unittest e2e/test_ui.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import ui  # noqa: E402

HERE = os.path.dirname(__file__)


def screen(name):
    with open(os.path.join(HERE, 'fixtures', f'{name}.xml'), encoding='utf-8') as f:
        return ui.parse(f.read())


def flow_patterns(name, cmd):
    """The regexes a flow file uses for one command (tap/type)."""
    out = []
    with open(os.path.join(HERE, f'{name}.flow'), encoding='utf-8') as f:
        for line in f:
            c, _, rest = line.strip().partition(' ')
            if c == cmd:
                out.append(rest.partition(' ')[0] if cmd == 'type' else rest)
    return out


class CustomerScreens(unittest.TestCase):
    def test_onboarding_has_the_sign_in_link(self):
        ns = screen('customer-onboarding')
        self.assertIsNotNone(ui.find_node(ns, 'I already have an account'))
        self.assertIsNone(ui.find_box(ns, 'Your.password|^Password$'))

    def test_login_boxes_are_the_input_fields_not_their_labels(self):
        ns = screen('customer-login')
        phone, password = flow_patterns('customer', 'type')[:2]
        phone_box, password_box = ui.find_box(ns, phone), ui.find_box(ns, password)
        self.assertTrue(ui.is_box(phone_box) and ui.is_box(password_box))
        self.assertNotEqual(ui.center(phone_box), ui.center(password_box))
        self.assertLess(ui.center(phone_box)[1], ui.center(password_box)[1], 'phone box is above the password box')
        self.assertIsNotNone(ui.find_node(ns, '^Sign in$'))

    def test_a_tap_that_navigates_changes_the_signature(self):
        self.assertNotEqual(ui.signature(screen('customer-onboarding')), ui.signature(screen('customer-login')))

    def test_the_status_bar_clock_does_not_count_as_a_change(self):
        with open(os.path.join(HERE, 'fixtures', 'customer-onboarding.xml'), encoding='utf-8') as f:
            xml = f.read()
        clock = ui.parse(xml)
        times = [n.get('text') for n in clock if n.get('package') == 'com.android.systemui' and ':' in (n.get('text') or '')]
        self.assertTrue(times, 'the fixture has a status-bar clock')
        later = ui.parse(xml.replace(f'text="{times[0]}"', 'text="9:59 "'))
        self.assertEqual(ui.signature(clock), ui.signature(later))


class RiderScreens(unittest.TestCase):
    def test_rider_login_boxes_and_button(self):
        ns = screen('rider-login')
        phone, password = flow_patterns('rider', 'type')[:2]
        phone_box, password_box = ui.find_box(ns, phone), ui.find_box(ns, password)
        self.assertTrue(ui.is_box(phone_box) and ui.is_box(password_box))
        self.assertEqual(password_box.get('password'), 'true')
        self.assertNotEqual(phone_box.get('password'), 'true')
        self.assertIsNotNone(ui.find_node(ns, 'Sign in as rider'))


class FakePhone(unittest.TestCase):
    """The retry logic, against a scripted sequence of screens instead of an emulator."""

    def setUp(self):
        self.taps = []
        self.screens = []
        self.typed = None
        self.saved = (ui.adb, ui.hierarchy, ui.time.sleep, ui.DEVICE)
        ui.failures.clear()

        def fake_adb(*args, check=True):
            if args[:3] == ('shell', 'input', 'tap'):
                self.taps.append(args[3:])
            return ''

        ui.adb = fake_adb
        ui.hierarchy = lambda: self.screens.pop(0) if len(self.screens) > 1 else self.screens[0]
        ui.time.sleep = lambda s: None

    def tearDown(self):
        ui.adb, ui.hierarchy, ui.time.sleep, ui.DEVICE = self.saved

    def xml(self, name):
        with open(os.path.join(HERE, 'fixtures', f'{name}.xml'), encoding='utf-8') as f:
            return f.read()

    def test_a_tap_that_did_nothing_is_repeated_until_the_screen_changes(self):
        onboarding, login = self.xml('customer-onboarding'), self.xml('customer-login')
        # find, then: tap 1 -> same screen, tap 2 -> login screen
        self.screens = [onboarding, onboarding, login]
        self.assertTrue(ui.tap('I already have an account'))
        self.assertEqual(len(self.taps), 2)
        self.assertEqual(ui.failures, [])

    def test_the_battery_dialog_is_answered_with_allow(self):
        dialog = (
            "<hierarchy>"
            "<node text='Let app always run in background?' package='com.android.settings' bounds='[60,800][1020,900]'/>"
            "<node text='Deny' package='com.android.settings' bounds='[600,1300][760,1380]'/>"
            "<node text='Allow' package='com.android.settings' bounds='[800,1300][960,1380]'/>"
            "</hierarchy>"
        )
        self.assertTrue(ui.clear_system_dialogs(ui.parse(dialog)))
        self.assertEqual(self.taps, [('880', '1340')])

    def test_a_missing_element_is_reported(self):
        self.screens = [self.xml('customer-onboarding')]
        self.assertFalse(ui.tap('^Sign in as rider$'))
        self.assertEqual(len(ui.failures), 1)

    def test_typed_text_is_read_back_and_retried(self):
        login = self.xml('customer-login')
        typed = login.replace('text="9876543210"', 'text="9876500001"', 1)

        class Box:
            def __init__(box, test):
                box.test = test

            def set_text(box, value):
                box.test.typed = value

        ui.DEVICE = lambda **kw: Box(self)
        # attempt 1 reads back the old text (dropped), attempt 2 reads back the right text
        self.screens = [login, login, login, typed, typed]
        self.assertTrue(ui.type_into('^9876543210$|Mobile.number.or.email', '9876500001'))
        self.assertEqual(self.typed, '9876500001')
        self.assertEqual(ui.failures, [])


if __name__ == '__main__':
    unittest.main()
