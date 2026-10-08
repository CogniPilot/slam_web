include RGBDRenderedRevisitGridAcceptance.makefile

# Compile the hash-checked reference C directly; do not rely on old object files.
RUNTIME_LIBS = -lSimulationRuntimeC -lOpenModelicaRuntimeC -lomcgc -lm -ldl -lpthread -lstdc++

.PHONY: rendered-slam-driver
rendered-slam-driver:
	$(CC) -O2 -DOM_HAVE_PTHREADS $(CPPFLAGS) $(DRIVER_SOURCE) RGBDRenderedRevisitGridAcceptance_functions.c RGBDRenderedRevisitGridAcceptance_records.c -o $(DRIVER_OUTPUT) $(shell cat RGBDRenderedRevisitGridAcceptance.libs) $(LDFLAGS)
