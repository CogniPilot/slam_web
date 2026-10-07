include PoseGraphRunStorage.makefile

# The generated PGRun functions use no direct BLAS/Fortran entry points.
# Shared runtime dependencies retain their own linkage and are inventoried.
RUNTIME_LIBS = -lSimulationRuntimeC -lOpenModelicaRuntimeC -lomcgc -lm -ldl -lpthread -lstdc++

.PHONY: pgrun-driver
pgrun-driver:
	$(CC) -O3 -DOM_HAVE_PTHREADS $(CPPFLAGS) $(DRIVER_SOURCE) PoseGraphRunStorage_functions.c -o $@ $(LDFLAGS)
