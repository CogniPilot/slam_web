/* Diagnostic transport/timing only; OMC's unchanged Modelica functions own SLAM. */
#include "RGBDRenderedRevisitGridAcceptance_functions.h"
#include <stdint.h>
#include <string.h>
#include <time.h>

static void read_exact(FILE *file, void *data, size_t size) {
  if (fread(data, 1, size, file) != size) {
    fprintf(stderr, "Incomplete reference input\n"); exit(2);
  }
}

static double seconds(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now)) exit(2);
  return now.tv_sec + now.tv_nsec / 1e9;
}

static real_array array(void *data, int rank, _index_t *shape) {
  return (real_array){.ndims=rank, .dim_size=shape, .data=data, .flexible=0};
}

int main(int argc, char **argv) {
  const uint16_t endian = 1;
  if (argc != 3 || *(const uint8_t *)&endian != 1
      || sizeof(modelica_real) != 8 || sizeof(modelica_integer) != 8) return 2;
  FILE *input = fopen(argv[1], "rb"), *output = fopen(argv[2], "w");
  if (!input || !output) return 2;
  uint64_t header[5]; read_exact(input, header, sizeof(header));
  size_t frames=header[1], height=header[2], width=header[3], channels=header[4];
  if (header[0] != 1 || frames < 2 || frames > 121 || !height || height > 720
      || !width || width > 1280 || channels != 3) return 2;
  size_t pixels=height*width, rgb_count=pixels*channels;
  uint8_t *rgb_bytes=malloc(rgb_count);
  uint16_t *depth_codes=malloc(pixels*sizeof(uint16_t));
  double *rgb=malloc(rgb_count*8), *depth=malloc(pixels*8);
  double *rgb_before=malloc(rgb_count*8), *depth_before=malloc(pixels*8);
  if (!rgb_bytes || !depth_codes || !rgb || !depth || !rgb_before || !depth_before) return 2;
  double calibration[14], optical[9], initial_imu[6], depth_units;
  read_exact(input, calibration, sizeof(calibration));
  read_exact(input, optical, sizeof(optical));
  read_exact(input, initial_imu, sizeof(initial_imu));
  read_exact(input, &depth_units, sizeof(depth_units));
  _index_t rgb_shape[3]={height,width,channels}, depth_shape[2]={height,width};
  _index_t calibration_shape[1]={14}, rotation_shape[2]={3,3}, imu_shape[1]={6}, vector_shape[1]={3};
  double zero[3]={0,0,0}, identity[9]={1,0,0,0,1,0,0,0,1};
  MMC_INIT(0);
  omc_alloc_interface.init();
  MMC_TRY_TOP()
  double reset_start=seconds();
  RGBDGraphProcessing_State previous=omc_RGBDGraphProcessing_Empty(threadData,
    omc_RGBDLocalizationCatalog_Empty(threadData,
      omc_RGBDLocalizationCatalog_EmptyEstimator(threadData,
        array(zero,1,vector_shape),array(zero,1,vector_shape),array(identity,2,rotation_shape),
        array(zero,1,vector_shape),array(zero,1,vector_shape),
        omc_RGBDLocalizationInitializeTests_Covariance(threadData)),1,1,1,0));
  fprintf(stderr,"{\"phase\":\"reset\",\"start\":%.9f,\"end\":%.9f}\n",reset_start,seconds());
  fprintf(output,"frame,simTime,start,end,kernelMs,readonlyInputs");
  for (int i=0;i<24;i++) fprintf(output,",raw%d",i+1);
  fprintf(output,"\n");
  for (size_t frame=0;frame<frames;frame++) {
    double time, holds[36*8]; uint64_t count;
    read_exact(input,&time,8); read_exact(input,&count,8);
    if (count > 36 || (frame == 0 ? count != 0 : count == 0)) return 2;
    read_exact(input,holds,count*8*8);
    read_exact(input,rgb_bytes,rgb_count);
    read_exact(input,depth_codes,pixels*2);
    /* Only adapt the reference Real-array ABI, outside the timed Modelica call.
       Raw source RGB8/Z16 codes are preserved; no metric depth or CV is computed. */
    for (size_t i=0;i<rgb_count;i++) rgb[i]=rgb_bytes[i];
    for (size_t i=0;i<pixels;i++) depth[i]=depth_codes[i];
    memcpy(rgb_before,rgb,rgb_count*8); memcpy(depth_before,depth,pixels*8);
    _index_t hold_shape[2]={count,8};
    RGBDFastSLAMRawCompositionReference_Outcome current;
    modelica_integer reason=0, processed=0, failed=0;
    double start=seconds();
    if (frame == 0) {
      current=omc_RGBDRenderedFlightSLAMReference_Initialize(threadData,previous,
        array(rgb,3,rgb_shape),array(depth,2,depth_shape),array(calibration,1,calibration_shape),
        array(optical,2,rotation_shape),array(initial_imu,1,imu_shape),depth_units);
    } else {
      RGBDRenderedCitySLAMReference_BatchResult batch=omc_RGBDRenderedFlightSLAMReference_Advance(
        threadData,previous,array(rgb,3,rgb_shape),array(depth,2,depth_shape),
        array(calibration,1,calibration_shape),array(optical,2,rotation_shape),
        array(holds,2,hold_shape),frame,time,depth_units,1,1);
      current=batch._value; reason=batch._batchReason;
      processed=batch._processedIntervals; failed=batch._failedInterval;
    }
    double end=seconds();
    int readonly=!memcmp(rgb_before,rgb,rgb_count*8)&&!memcmp(depth_before,depth,pixels*8);
    if (!readonly || !current._accepted || reason || failed || processed != (modelica_integer)count) return 3;
    real_array metrics=omc_RGBDRenderedCitySLAMReference_Metrics(threadData,current,frame,time,reason,processed,failed);
    if (real_array_nr_of_elements(metrics) != 24) return 3;
    fprintf(output,"%zu,%.17g,%.9f,%.9f,%.9f,%d",frame,time,start,end,(end-start)*1000,readonly);
    for (int i=0;i<24;i++) fprintf(output,",%.17g",((double*)metrics.data)[i]);
    fprintf(output,"\n"); fflush(output);
    fprintf(stderr,"{\"frame\":%zu,\"start\":%.9f,\"end\":%.9f,\"kernelMs\":%.6f}\n",frame,start,end,(end-start)*1000);
    previous=current._next;
  }
  if (fgetc(input) != EOF || fclose(input) || fclose(output)) return 2;
  MMC_CATCH_TOP(return 3)
  return 0;
}
