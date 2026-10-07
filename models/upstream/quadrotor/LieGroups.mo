package LieGroups
  package SO3
    package Quat
      function kinematics "Quaternion kinematics: q_dot = 0.5 * q * [0, omega]"
        input Real q[4] "Unit quaternion {w,x,y,z}";
        input Real omega[3] "Body-frame angular velocity {p,q,r}";
        output Real q_dot[4] "Time derivative of quaternion";
      algorithm
        q_dot[1] := 0.5 * (-q[2]*omega[1] - q[3]*omega[2] - q[4]*omega[3]);
        q_dot[2] := 0.5 * ( q[1]*omega[1] - q[4]*omega[2] + q[3]*omega[3]);
        q_dot[3] := 0.5 * ( q[4]*omega[1] + q[1]*omega[2] - q[2]*omega[3]);
        q_dot[4] := 0.5 * (-q[3]*omega[1] + q[2]*omega[2] + q[1]*omega[3]);
      end kinematics;
      
      function to_DCM "Convert unit quaternion to 3x3 rotation matrix (DCM)"
        input Real q[4] "{w,x,y,z}";
        output Real R[3,3] "Rotation matrix (body to world)";
      protected
        Real a, b, c, d;
        Real aa, ab, ac, ad, bb, bc, bd, cc, cd, dd;
      algorithm
        a := q[1]; b := q[2]; c := q[3]; d := q[4];
        aa := a*a; ab := a*b; ac := a*c; ad := a*d;
        bb := b*b; bc := b*c; bd := b*d;
        cc := c*c; cd := c*d;
        dd := d*d;
      
        R[1,1] := aa + bb - cc - dd;
        R[1,2] := 2*(bc - ad);
        R[1,3] := 2*(bd + ac);
        R[2,1] := 2*(bc + ad);
        R[2,2] := aa - bb + cc - dd;
        R[2,3] := 2*(cd - ab);
        R[3,1] := 2*(bd - ac);
        R[3,2] := 2*(cd + ab);
        R[3,3] := aa - bb - cc + dd;
      end to_DCM;
      
    end Quat;
  end SO3;
end LieGroups;
