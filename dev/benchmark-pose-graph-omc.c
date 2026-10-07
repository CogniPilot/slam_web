/* Diagnostic driver for OMC's generated PGRun; no estimator math lives here. */
#include "PoseGraphRunStorage_functions.h"
#include <stdint.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

static void transfer(FILE *file, void *data, size_t count, int writing) {
  size_t actual = writing ? fwrite(data, 8, count, file) : fread(data, 8, count, file);
  if (actual != count) { fprintf(stderr, "Incomplete binary transfer\n"); exit(2); }
}

static double milliseconds(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now)) exit(2);
  return now.tv_sec*1000.0 + now.tv_nsec/1e6;
}

int main(int argc, char **argv) {
  if (argc != 5 || sizeof(modelica_real) != 8 || sizeof(modelica_integer) != 8) return 2;
  int repetitions = atoi(argv[3]), warmups = atoi(argv[4]);
  if (repetitions < 1 || repetitions > 100 || warmups < 0 || warmups > 10) return 2;
  FILE *file = fopen(argv[1], "rb");
  if (!file) return 2;
  uint64_t capacities[2]; transfer(file, capacities, 2, 0);
  if (capacities[0] != 128 || capacities[1] != 256) return 2;
  _index_t n = capacities[0], m = capacities[1];
  _index_t shapes[9][3] = {{n,3,0}, {n,3,3}, {n,0,0}, {m,0,0},
    {m,3,0}, {m,3,3}, {m,6,6}, {m,0,0}, {m,0,0}};
  int ranks[9] = {2,3,1,1,2,3,3,1,1};
  base_array_t inputs[9];
  size_t counts[9];
  for (int i=0; i<9; i++) {
    counts[i] = 1;
    for (int axis=0; axis<ranks[i]; axis++) counts[i] *= shapes[i][axis];
    void *data = malloc(counts[i]*8);
    if (!data) return 2;
    inputs[i] = (base_array_t){.ndims=ranks[i], .dim_size=shapes[i], .data=data, .flexible=0};
    transfer(file, data, counts[i], 0);
  }
  double controls[5]; int64_t budgets[3];
  transfer(file, controls, 5, 0); transfer(file, budgets, 3, 0);
  if (fgetc(file) != EOF || fclose(file)) return 2;
  unsigned char *before[9];
  for (int i=0; i<9; i++) {
    before[i] = malloc(counts[i]*8);
    if (!before[i]) return 2;
    memcpy(before[i], inputs[i].data, counts[i]*8);
  }
  MMC_INIT(0);
  omc_alloc_interface.init();
  MMC_TRY_TOP()
  real_array nextP = {0}, nextR = {0};
  double cost, accepted, pcg, samples[100];
  size_t outputCount = n*12+3;
  double *previous = malloc(outputCount*8), *output = malloc(outputCount*8);
  if (!previous || !output) return 2;
  for (int i=-warmups; i<repetitions; i++) {
    if (i == 0 && getenv("PGRUN_PROFILE_PHASE"))
      fprintf(stderr, "{\"phase\":\"evaluate-start\",\"pid\":%ld,\"monotonicSeconds\":%.9f}\n", (long)getpid(), milliseconds()/1000.0);
    double start = milliseconds();
    nextP = omc_PGRun(threadData, inputs[0], inputs[1], inputs[2], inputs[3],
      inputs[7], inputs[8], inputs[4], inputs[5], inputs[6],
      controls[0], controls[1], controls[2], controls[3], controls[4],
      budgets[0], budgets[1], budgets[2], &nextR, &cost, &accepted, &pcg);
    double elapsed = milliseconds()-start;
    if (i >= 0) samples[i] = elapsed;
    memcpy(output, nextP.data, n*3*8);
    memcpy(output+n*3, nextR.data, n*9*8);
    output[n*12] = cost; output[n*12+1] = accepted; output[n*12+2] = pcg;
    if (i > -warmups && memcmp(previous, output, outputCount*8)) {
      fprintf(stderr, "Repeated outputs changed\n"); return 3;
    }
    memcpy(previous, output, outputCount*8);
  }
  if (getenv("PGRUN_PROFILE_PHASE"))
    fprintf(stderr, "{\"phase\":\"evaluate-end\",\"pid\":%ld,\"monotonicSeconds\":%.9f}\n", (long)getpid(), milliseconds()/1000.0);
  for (int i=0; i<9; i++) if (memcmp(before[i], inputs[i].data, counts[i]*8)) {
    fprintf(stderr, "Readonly input changed\n"); return 3;
  }
  file = fopen(argv[2], "wb"); if (!file) return 2;
  transfer(file, output, outputCount, 1); if (fclose(file)) return 2;
  printf("{\"readonlyInputs\":true,\"repeatedOutputBitsEqual\":true,\"timesMs\":[");
  for (int i=0; i<repetitions; i++) printf("%s%.9f", i ? "," : "", samples[i]);
  printf("]}\n");
  MMC_CATCH_TOP(fprintf(stderr, "OMC runtime exception\n"); return 3;)
  return 0;
}
