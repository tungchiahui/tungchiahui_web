### 3.2.4 stage\_ros2基本模型

基本模型（model）模拟具有基本属性的对象；位置、大小、速度、颜色、对各种传感器的可见性等。基本模型还具有由线性列表组成的主体。在内部，基本模型被用作所有其他模型类型的基类。我们可以使用基本模型来模拟环境对象。在stage中，底盘模型、雷达模型、相机模型等都可以看作是基本模型的子类。

![](/assets/3.2.4_基本模型.PNG)

#### 1.添加基本模型

在stage\_sim.launch.py文件中添加如下内容：

```
# -----------------------------------------------------------------------------
# 添加障碍物
model( pose [ -2 -4 0 0 ] color "green")
# define a block
define my_block model
(
  size [1.0 1.0 1.0]
  gui_nose 0
  gui_grid 0
  gui_outline 0
)

# throw in a block
my_block( pose [ 0 4 0 90 ] color "red" bitmap "maps/ghost.png")
```

上述代码中，直接使用默认的基础model创建了一个绿色模型对象，并且还自定义了继承自model的my\_block模型，然后创建了该模型对象。

#### 2.编译执行

构建功能包并执行launch文件后，运行结果如下。![](/assets/3.2.4_基础model.PNG)

#### 3.窗体参数

**摘要和默认值**

```
model (
    pose [ 0.0 0.0 0.0 0.0 ]
    size [ 0.1 0.1 0.1 ]
    origin [ 0.0 0.0 0.0 0.0 ]
    velocity [ 0.0 0.0 0.0 0.0 ]

    color "red"
    color_rgba [ 0.0 0.0 0.0 1.0 ]
    bitmap ""
    ctrl ""

    # determine how the model appears in various sensors
    fiducial_return 0
    fiducial_key 0
    obstacle_return 1
    ranger_return 1
    blob_return 1
    laser_return LaserVisible
    gripper_return 0
    gravity_return 0
    sticky_return 0

    # GUI properties
    gui_nose 0
    gui_grid 0
    gui_outline 1
    gui_move 0 (1 if the model has no parents);

    boundary 0
    mass 10.0
    map_resolution 0.1
    say ""
    alwayson 0
)
```

**详解**

* pose \[ x:&lt;float&gt; y:&lt;float&gt; z:&lt;float&gt; heading:&lt;float&gt; \]  
  指定模型在其父坐标系中的姿态。

* size \[ x:&lt;float&gt; y:&lt;float&gt; z:&lt;float&gt; \]  
  指定模型在各个维度上的大小。

* origin \[ x:&lt;float&gt; y:&lt;float&gt; z:&lt;float&gt; heading:&lt;float&gt; \]  
  指定对象中心的位置，相对于其姿态。

* velocity \[ x:&lt;float&gt; y:&lt;float&gt; z:&lt;float&gt; heading:&lt;float&gt; omega:&lt;float&gt; \]  
  指定模型的初始速度。请注意，如果模型撞到障碍物，其速度将被设置为零。

* velocity\_enable int \(默认为0\)  
  大多数模型忽略其速度状态。这样可以节省处理时间，因为大多数模型的速度永远不会被设置为非零值。一些子类（例如ModelPosition）会改变这个默认值，因为它们期望移动。用户可以在这里指定一个非零值来启用对该模型的速度控制。这与调用Model::VelocityEnable\(\)的效果相同。

* color &lt;string&gt;  
  使用X11数据库（rgb.txt）中的颜色名称指定对象的颜色。

* bitmap filename:&lt;string&gt;  
  通过解释位图中的线条来绘制模型（支持bmp、jpeg、gif、png）。文件被打开并解析为一组线条。这些线条被缩放以适应模型当前大小所定义的矩形内。

* ctrl &lt;string&gt;  
  指定模型的控制器模块及其参数字符串。例如，字符串"foo bar bash"将加载libfoo.so，其Init\(\)函数将以整个字符串作为参数进行调用（包括库名称）。控制器需要解析字符串（如果需要参数）。

* fiducial\_return fiducial\_id &lt;int&gt;  
  如果非零，则通过fiducialfinder传感器检测到此模型。该值用作基准标识符。

* fiducial\_key &lt;int&gt;  
  仅当模型和fiducialfinder的fiducial\_key值匹配时，fiducial\_id模型才会被fiducialfinder检测到。这允许您在同一环境中拥有几种独立类型的基准标识，每种类型只显示在为其"调谐"的fiducialfinders中。

* obstacle\_return &lt;int&gt;  
  如果为1，则此模型可以与具有此属性设置的其他模型发生碰撞。

* ranger\_return &lt;int&gt;  
  如果为1，则该模型可以被ranger传感器检测到。

* blob\_return &lt;int&gt;  
  如果为1，则该模型可以在blob\_finder中被检测到（取决于其颜色）。

* laser\_return &lt;int&gt;  
  如果为0，则此模型不会被激光传感器检测到。如果为1，则该模型在激光传感器中显示为正常（0）反射。如果为2，则显示为高（1）反射。

* gripper\_return &lt;int&gt;  
  如果为1，则该模型可以被夹爪夹取，并且可以通过与具有非零obstacle\_return的任何东西的碰撞来推动。

* gui\_nose &lt;int&gt;  
  如果为1，则在模型上绘制显示其朝向的鼻子（正X轴）。

* gui\_grid &lt;int&gt;  
  如果为1，则在模型上绘制比例网格。

* gui\_outline &lt;int&gt;  
  如果为1，则在模型周围绘制边界框，指示其大小。

* gui\_move &lt;int&gt;  
  如果为1，则模型可以在GUI窗口中通过鼠标移动。



