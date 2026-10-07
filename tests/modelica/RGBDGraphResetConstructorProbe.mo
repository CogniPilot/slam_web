// Constructor validation probe; all production constructors remain unchanged.
package RGBDGraphResetConstructorProbe
  function Run
    input Real clock;
    input Integer scenario;
    output Real marker;
  protected
    Real covariance[15,15];
    Real rotation[3,3];
    RGBDGraphProcessing.State state;
  algorithm
    covariance := diagonal({0.25,0.25,0.25,0.04,0.04,0.04,
      0.01,0.01,0.01,0.0004,0.0004,0.0004,0.000025,0.000025,0.000025});
    rotation := identity(3);
    if scenario == 1 then
      covariance[1,1] := -1.0-abs(clock);
    elseif scenario == 2 then
      rotation[1,1] := 2.0+abs(clock);
    end if;
    state := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(rotation=rotation,covariance=covariance)));
    marker := if RGBDGraphProcessing.Valid(state) then 1.0 else 0.0;
  end Run;

  model ValidSeed
    output Real marker;
  equation
    marker = Run(time,0);
  end ValidSeed;

  model InvalidCovariance
    output Real marker;
  equation
    marker = Run(time,1);
  end InvalidCovariance;

  model InvalidRotation
    output Real marker;
  equation
    marker = Run(time,2);
  end InvalidRotation;
end RGBDGraphResetConstructorProbe;
