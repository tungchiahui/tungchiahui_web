### 3.2.5 stage\_ros2添加地图

本节我们将在仿真环境中，添加一张全局地图，请先准备一张作为全局地图的图片。

#### 1.添加地图

在stage\_sim.launch.py文件中添加如下内容：

```
# -----------------------------------------------------------------------------
# 设置地图(定义模型)
define floorplan model
(
  color "gray30"  # 颜色
  boundary 1  # 为地图设置边框

  gui_nose 0
  gui_grid 0 

  gui_outline 0
  gripper_return 0
  fiducial_return 0
  laser_return 1
)

# 加载地图
floorplan
( 
  name "room"
  size [16.000 16.000 0.800]
  pose [0 0 0 0]
  bitmap "maps/room.jpg"
  gui_move 0
)
```

上述代码自定义了floorplan模型，并根据此模型创建了一个加载了地图数据的floorplan对象。

#### 2.编译执行

构建功能包并执行launch文件后，运行结果如下。![](/assets/3.2.5_添加地图.PNG)

