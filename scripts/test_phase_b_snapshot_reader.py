"""UNEXECUTED until a separate GO. Synthetic receipts only: catches the r7 snapshot-set bug without a run."""
import importlib.util, pathlib, unittest
spec = importlib.util.spec_from_file_location('reader', pathlib.Path(__file__).with_name('phase_b_snapshot_reader.py'))
reader = importlib.util.module_from_spec(spec); spec.loader.exec_module(reader)
PHASE_A_FRAMES = [80, 90, 121, 122, 1175, 1200, 1205, 1206, 1250]
def receipt_for(frames): return [dict(epoch=e, side=s) for e in frames for s in ('previous', 'next')]
def plan_for(frames):
    # Phase B shape: the plan asks for one state at some frames (next at B-1, previous at B) and both at events.
    snaps = [dict(side='candidate', epoch=frames[0], state='next'), dict(side='candidate', epoch=frames[1], state='previous')]
    snaps += [dict(side='candidate', epoch=e, state=s) for e in frames[2:] for s in ('previous', 'next')]
    return dict(B=frames[1], snapshots=snaps + [dict(side='baseline', epoch=frames[0], state='next')])
class SnapshotSet(unittest.TestCase):
    def test_phase_a_shaped_receipt_passes(self):
        plan = plan_for(PHASE_A_FRAMES)
        self.assertEqual(len(reader.check_snapshot_set(receipt_for(PHASE_A_FRAMES), plan, dict(snapshotCount=18))), 18)
    def test_missing_state_fails(self):
        plan = plan_for(PHASE_A_FRAMES); r = receipt_for(PHASE_A_FRAMES)[:-1]
        with self.assertRaises(AssertionError): reader.check_snapshot_set(r, plan, dict(snapshotCount=18))
    def test_same_size_different_set_fails(self):
        plan = plan_for(PHASE_A_FRAMES); r = receipt_for(PHASE_A_FRAMES[:-1] + [1249])
        with self.assertRaises(AssertionError): reader.check_snapshot_set(r, plan, dict(snapshotCount=18))
    def test_duplicate_fails(self):
        plan = plan_for(PHASE_A_FRAMES); r = receipt_for(PHASE_A_FRAMES); r[-1] = dict(epoch=1250, side='previous')
        with self.assertRaises(AssertionError): reader.check_snapshot_set(r, plan, dict(snapshotCount=18))
    def test_wrong_contract_count_fails(self):
        plan = plan_for(PHASE_A_FRAMES)
        with self.assertRaises(AssertionError): reader.check_snapshot_set(receipt_for(PHASE_A_FRAMES), plan, dict(snapshotCount=17))
if __name__ == '__main__': unittest.main()
